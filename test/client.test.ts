import { signWebhook } from "../src/internal/index.js";
import { describe, expect, it } from "vitest";
import { constructEvent, PagosRD, PagosRDConnectionError, PagosRDError, WebhookSignatureError } from "../src/index.js";

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("sin más respuestas");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { calls, fn };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("cliente", () => {
  it("rechaza llaves mal formadas", () => {
    expect(() => new PagosRD("clave")).toThrow(/sk_test_/);
    expect(new PagosRD("sk_test_abc").testMode).toBe(true);
    expect(new PagosRD("sk_live_abc").testMode).toBe(false);
  });

  it("envía la llave, el cuerpo y una llave de idempotencia en los POST", async () => {
    const f = fakeFetch([json(201, { id: "pl_1", object: "payment_link" })]);
    const client = new PagosRD("sk_test_abc", { baseUrl: "http://localhost:4000/", fetch: f.fn });
    const link = await client.paymentLinks.create({ merchant_id: "mer_1", amount: 450000, description: "Cuota" });
    expect(link.id).toBe("pl_1");
    const headers = f.calls[0]!.init.headers as Record<string, string>;
    expect(f.calls[0]!.url).toBe("http://localhost:4000/v1/payment_links");
    expect(headers.authorization).toBe("Bearer sk_test_abc");
    expect(headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(String(f.calls[0]!.init.body))).toMatchObject({ amount: 450000 });
  });

  it("cobra con tarjeta guardada con la llave de idempotencia del pedido y reintenta con la misma", async () => {
    const f = fakeFetch([json(503, { detail: "caído" }), json(201, { id: "pay_1", object: "payment", status: "succeeded" })]);
    const client = new PagosRD("sk_test_abc", { fetch: f.fn, maxRetries: 2 });
    const pay = await client.payments.create({ payment_method_id: "pm_1", amount: 85000, description: "Pedido #4521" }, { idempotencyKey: "pedido-4521" });
    expect(pay.status).toBe("succeeded");
    expect(f.calls.map((c) => (c.init.headers as Record<string, string>)["idempotency-key"])).toEqual(["pedido-4521", "pedido-4521"]);
    expect(f.calls[0]!.url).toBe("https://api.pagosrd.com/v1/payments");

    const g = fakeFetch([json(200, { object: "list", data: [], has_more: false }), json(200, { id: "pm_1", status: "deleted" })]);
    const c2 = new PagosRD("sk_test_abc", { fetch: g.fn });
    await c2.paymentMethods.list({ customer_reference: "cliente-8812" });
    expect(g.calls[0]!.url).toBe("https://api.pagosrd.com/v1/payment_methods?customer_reference=cliente-8812");
    await c2.paymentMethods.del("pm_1");
    expect(g.calls[1]!.init.method).toBe("DELETE");
  });

  it("crea, cambia y cancela suscripciones", async () => {
    const f = fakeFetch([json(201, { id: "sub_1", status: "active" }), json(200, { id: "sub_1" }), json(200, { id: "sub_1", status: "canceled" })]);
    const client = new PagosRD("sk_test_abc", { fetch: f.fn });
    await client.subscriptions.create({ payment_method_id: "pm_1", amount: 450000, description: "Cuota", interval: "month" }, { idempotencyKey: "contrato-4b" });
    expect(f.calls[0]!.url).toBe("https://api.pagosrd.com/v1/subscriptions");
    expect((f.calls[0]!.init.headers as Record<string, string>)["idempotency-key"]).toBe("contrato-4b");
    await client.subscriptions.update("sub_1", { payment_method_id: "pm_2" });
    expect(f.calls[1]!.init.method).toBe("PATCH");
    expect(JSON.parse(String(f.calls[1]!.init.body))).toEqual({ payment_method_id: "pm_2" });
    const canceled = await client.subscriptions.cancel("sub_1");
    expect(f.calls[2]!.url).toBe("https://api.pagosrd.com/v1/subscriptions/sub_1/cancel");
    expect(canceled.status).toBe("canceled");
  });

  it("adelanta el siguiente cobro de una suscripción (solo en prueba)", async () => {
    const f = fakeFetch([json(200, { id: "sub_1", status: "active" })]);
    const client = new PagosRD("sk_test_abc", { fetch: f.fn });
    await client.subscriptions.advance("sub_1");
    expect(f.calls[0]!.url).toBe("https://api.pagosrd.com/v1/subscriptions/sub_1/advance");
    expect(f.calls[0]!.init.method).toBe("POST");
  });

  it("reintenta un POST tras un 503 con la MISMA llave de idempotencia", async () => {
    const f = fakeFetch([json(503, { detail: "caído" }), json(201, { id: "re_1" })]);
    const client = new PagosRD("sk_test_abc", { fetch: f.fn, maxRetries: 2 });
    await client.refunds.create("pay_1", { amount: 100 });
    expect(f.calls).toHaveLength(2);
    const k1 = (f.calls[0]!.init.headers as Record<string, string>)["idempotency-key"];
    const k2 = (f.calls[1]!.init.headers as Record<string, string>)["idempotency-key"];
    expect(k1).toBe(k2);
  });

  it("reintenta ante fallas de red y luego se rinde con un error claro", async () => {
    const f = fakeFetch([new TypeError("fetch failed"), new TypeError("fetch failed"), new TypeError("fetch failed")]);
    const client = new PagosRD("sk_test_abc", { fetch: f.fn, maxRetries: 2 });
    await expect(client.payments.retrieve("pay_1")).rejects.toBeInstanceOf(PagosRDConnectionError);
    expect(f.calls).toHaveLength(3);
  });

  it("convierte Problem Details en PagosRDError", async () => {
    const f = fakeFetch([json(422, { code: "datos_invalidos", detail: "amount debe ser entero", field: "amount" }, { "x-request-id": "req_1" })]);
    const client = new PagosRD("sk_test_abc", { fetch: f.fn });
    const err = await client.paymentLinks.create({ merchant_id: "m", amount: 1.5, description: "x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PagosRDError);
    expect(err).toMatchObject({ status: 422, code: "datos_invalidos", field: "amount", requestId: "req_1", message: "amount debe ser entero" });
  });

  it("no reintenta errores 4xx", async () => {
    const f = fakeFetch([json(409, { code: "link_no_abierto", detail: "x" })]);
    const client = new PagosRD("sk_test_abc", { fetch: f.fn });
    await expect(client.paymentLinks.cancel("pl_1")).rejects.toMatchObject({ status: 409 });
    expect(f.calls).toHaveLength(1);
  });

  it("recorre todas las páginas con autoPaginate", async () => {
    const f = fakeFetch([
      json(200, { object: "list", data: [{ id: "pay_3" }, { id: "pay_2" }], has_more: true }),
      json(200, { object: "list", data: [{ id: "pay_1" }], has_more: false }),
    ]);
    const client = new PagosRD("sk_test_abc", { fetch: f.fn });
    const ids: string[] = [];
    for await (const p of client.autoPaginate((page) => client.payments.list({ ...page, status: "succeeded" }), 2)) ids.push(p.id);
    expect(ids).toEqual(["pay_3", "pay_2", "pay_1"]);
    expect(f.calls[1]!.url).toContain("starting_after=pay_2");
    expect(f.calls[1]!.url).toContain("status=succeeded");
  });
});

describe("webhooks", () => {
  const secret = "whsec_prueba";
  const body = JSON.stringify({ id: "evt_1", object: "event", type: "payment.succeeded", livemode: false, data: { object: { id: "pay_1" }, payment_link_reference: "cuota-4b" }, created_at: "2026-10-24T15:00:00Z" });

  it("verifica y tipa el evento", () => {
    const event = constructEvent(body, signWebhook(secret, body), secret);
    expect(event.type).toBe("payment.succeeded");
    if (event.type === "payment.succeeded") expect(event.data.payment_link_reference).toBe("cuota-4b");
  });

  it("acepta el cuerpo como Buffer y rechaza firmas falsas", () => {
    expect(constructEvent(Buffer.from(body), signWebhook(secret, body), secret).id).toBe("evt_1");
    expect(() => constructEvent(body, signWebhook("otro", body), secret)).toThrow(WebhookSignatureError);
  });
});
