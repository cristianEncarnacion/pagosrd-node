import { randomUUID } from "node:crypto";
import type {
  AzulConfig,
  CardnetConfig,
  CreateMerchantParams,
  CustomerInfoParams,
  CreatePaymentLinkParams,
  CreatePaymentParams,
  CreateRefundParams,
  CreateSubscriptionParams,
  Event,
  List,
  Merchant,
  PageParams,
  Payment,
  PaymentLink,
  PaymentMethod,
  PaymentStatus,
  Refund,
  RequestOptions,
  Subscription,
  SubscriptionStatus,
  Summary,
  UpdateSubscriptionParams,
  WebhookDelivery,
  WebhookEndpoint,
} from "./types.js";

export const DEFAULT_BASE_URL = "https://api.pagosrd.com";

/** Error devuelto por la API (Problem Details). */
export class PagosRDError extends Error {
  override readonly name = "PagosRDError";
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly field: string | undefined,
    readonly requestId: string | undefined,
    readonly raw: unknown,
  ) {
    super(message);
  }
}

/** No se pudo hablar con la API (red caída, timeout). */
export class PagosRDConnectionError extends Error {
  override readonly name = "PagosRDConnectionError";
}

export interface PagosRDOptions {
  /** Por defecto https://api.pagosrd.com */
  baseUrl?: string;
  /** Reintentos ante fallas de red, 429 y 5xx. Por defecto 2. Los POST llevan llave de idempotencia, así que reintentar es seguro. */
  maxRetries?: number;
  /** Tiempo máximo por solicitud en ms. Por defecto 30000. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

type Query = object;

export class PagosRD {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly apiKey: string,
    options: PagosRDOptions = {},
  ) {
    if (!apiKey || !/^sk_(test|live)_/.test(apiKey)) {
      throw new Error("Llave de API inválida: debe empezar con sk_test_ o sk_live_.");
    }
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.maxRetries = options.maxRetries ?? 2;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  /** true si la llave es de modo de prueba. */
  get testMode(): boolean {
    return this.apiKey.startsWith("sk_test_");
  }

  // ---------------------------------------------------------------- recursos

  readonly paymentLinks = {
    create: (params: CreatePaymentLinkParams, opts?: RequestOptions) => this.post<PaymentLink>("/v1/payment_links", params, opts),
    retrieve: (id: string) => this.get<PaymentLink>(`/v1/payment_links/${enc(id)}`),
    list: (params: PageParams & { status?: PaymentLink["status"]; merchant_id?: string; reference?: string } = {}) =>
      this.get<List<PaymentLink>>("/v1/payment_links", params),
    cancel: (id: string) => this.post<PaymentLink>(`/v1/payment_links/${enc(id)}/cancel`, undefined),
  };

  readonly payments = {
    /**
     * Cobra con una tarjeta guardada, sin que el cliente vea ninguna página. La llave de
     * idempotencia es obligatoria: usa algo propio de la operación (el id del pedido) para
     * que reintentar nunca cobre dos veces. El pago vuelve succeeded, failed o processing.
     */
    create: (params: CreatePaymentParams, opts: RequestOptions & { idempotencyKey: string }) => this.post<Payment>("/v1/payments", params, opts),
    retrieve: (id: string) => this.get<Payment>(`/v1/payments/${enc(id)}`),
    list: (
      params: PageParams & {
        status?: PaymentStatus;
        merchant_id?: string;
        payment_link_id?: string;
        payment_method_id?: string;
        subscription_id?: string;
        created_gte?: string;
        created_lte?: string;
      } = {},
    ) => this.get<List<Payment>>("/v1/payments", params),
  };

  readonly paymentMethods = {
    retrieve: (id: string) => this.get<PaymentMethod>(`/v1/payment_methods/${enc(id)}`),
    list: (params: PageParams & { merchant_id?: string; customer_reference?: string; status?: PaymentMethod["status"] } = {}) =>
      this.get<List<PaymentMethod>>("/v1/payment_methods", params),
    /** Deja de poder usarse de inmediato y se borra el token en el procesador. */
    del: (id: string) => this.request<PaymentMethod>("DELETE", `/v1/payment_methods/${enc(id)}`, undefined, randomUUID()),
  };

  readonly subscriptions = {
    /**
     * PagosRD cobra solo en cada fecha con la tarjeta guardada; reintenta los rechazos a 1, 3 y 5 días.
     * La llave de idempotencia es obligatoria: usa el id del contrato para que reintentar no cree otra.
     */
    create: (params: CreateSubscriptionParams, opts: RequestOptions & { idempotencyKey: string }) => this.post<Subscription>("/v1/subscriptions", params, opts),
    retrieve: (id: string) => this.get<Subscription>(`/v1/subscriptions/${enc(id)}`),
    list: (params: PageParams & { status?: SubscriptionStatus; merchant_id?: string; customer_reference?: string; payment_method_id?: string } = {}) =>
      this.get<List<Subscription>>("/v1/subscriptions", params),
    update: (id: string, params: UpdateSubscriptionParams) => this.request<Subscription>("PATCH", `/v1/subscriptions/${enc(id)}`, params),
    /** Reintenta ya el cobro de una suscripción past_due o unpaid con la misma tarjeta. */
    retry: (id: string) => this.post<Subscription>(`/v1/subscriptions/${enc(id)}/retry`, undefined),
    cancel: (id: string) => this.post<Subscription>(`/v1/subscriptions/${enc(id)}/cancel`, undefined),
    /**
     * Solo con una llave de prueba: el siguiente cobro sale en el próximo minuto, sin esperar su fecha.
     * Para probar los cobros recurrentes y sus webhooks. El calendario no cambia.
     */
    advance: (id: string) => this.post<Subscription>(`/v1/subscriptions/${enc(id)}/advance`, undefined),
  };

  readonly refunds = {
    create: (paymentId: string, params: CreateRefundParams = {}, opts?: RequestOptions) => this.post<Refund>(`/v1/payments/${enc(paymentId)}/refunds`, params, opts),
    list: (params: PageParams & { payment_id?: string } = {}) => this.get<List<Refund>>("/v1/refunds", params),
  };

  readonly merchants = {
    create: (params: CreateMerchantParams) => this.post<Merchant>("/v1/merchants", params),
    retrieve: (id: string) => this.get<Merchant>(`/v1/merchants/${enc(id)}`),
    list: (params: PageParams = {}) => this.get<List<Merchant>>("/v1/merchants", params),
    update: (id: string, params: { name?: string; rnc?: string | null; status?: "active" | "disabled"; metadata?: Record<string, string>; customer_info?: CustomerInfoParams }) =>
      this.request<Merchant>("PATCH", `/v1/merchants/${enc(id)}`, params),
    setProcessorConfig: (id: string, config: AzulConfig | CardnetConfig) => this.request<Merchant>("PUT", `/v1/merchants/${enc(id)}/processor`, config),
    balance: (id: string) => this.get<{ object: "balance"; merchant_id: string; processor_receivable: number }>(`/v1/merchants/${enc(id)}/balance`),
  };

  readonly webhookEndpoints = {
    create: (params: { url: string; events?: string[]; description?: string | null }) => this.post<WebhookEndpoint & { secret: string }>("/v1/webhook_endpoints", params),
    list: () => this.get<List<WebhookEndpoint>>("/v1/webhook_endpoints"),
    retrieve: (id: string) => this.get<WebhookEndpoint>(`/v1/webhook_endpoints/${enc(id)}`),
    update: (id: string, params: { url?: string; events?: string[]; description?: string | null; enabled?: boolean }) =>
      this.request<WebhookEndpoint>("PATCH", `/v1/webhook_endpoints/${enc(id)}`, params),
    del: (id: string) => this.request<{ id: string; deleted: true }>("DELETE", `/v1/webhook_endpoints/${enc(id)}`),
    rollSecret: (id: string) => this.post<{ secret: string }>(`/v1/webhook_endpoints/${enc(id)}/roll_secret`, undefined),
    deliveries: (params: PageParams & { endpoint_id?: string; event_id?: string; status?: WebhookDelivery["status"] } = {}) =>
      this.get<List<WebhookDelivery>>("/v1/webhook_deliveries", params),
  };

  readonly events = {
    retrieve: (id: string) => this.get<Event>(`/v1/events/${enc(id)}`),
    list: (params: PageParams & { type?: string } = {}) => this.get<List<Event>>("/v1/events", params),
    resend: (id: string, endpointId?: string) => this.post<List<WebhookDelivery>>(`/v1/events/${enc(id)}/resend`, endpointId ? { endpoint_id: endpointId } : {}),
  };

  summary(params: { from?: string; to?: string } = {}) {
    return this.get<Summary>("/v1/summary", params);
  }

  /**
   * Recorre todas las páginas de una lista.
   *
   * for await (const pago of client.autoPaginate((p) => client.payments.list({ ...p, status: "succeeded" }))) { … }
   */
  async *autoPaginate<T extends { id: string }>(fetchPage: (page: PageParams) => Promise<List<T>>, pageSize = 100): AsyncGenerator<T> {
    let startingAfter: string | undefined;
    while (true) {
      const page = await fetchPage({ limit: pageSize, starting_after: startingAfter });
      for (const item of page.data) yield item;
      if (!page.has_more || page.data.length === 0) return;
      startingAfter = page.data[page.data.length - 1]!.id;
    }
  }

  // ---------------------------------------------------------------- HTTP

  private get<T>(path: string, query?: Query) {
    return this.request<T>("GET", path, undefined, undefined, query);
  }

  private post<T>(path: string, body: unknown, opts?: RequestOptions) {
    return this.request<T>("POST", path, body, opts?.idempotencyKey ?? randomUUID());
  }

  private async request<T>(method: string, path: string, body?: unknown, idempotencyKey?: string, query?: Query): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query ?? {}) as [string, unknown][]) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      "user-agent": "pagosrd-node/0.1.1",
      accept: "application/json",
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
    // Solo se reintenta lo que es seguro: GET, o POST con llave de idempotencia.
    const retryable = method === "GET" || Boolean(idempotencyKey);

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        if (retryable && attempt < this.maxRetries) {
          await sleep(backoff(attempt));
          continue;
        }
        throw new PagosRDConnectionError(`No se pudo conectar con PagosRD: ${(err as Error).message}`);
      }
      if ((res.status === 429 || res.status >= 500) && retryable && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
        continue;
      }
      const text = await res.text();
      const data: unknown = text ? safeJson(text) : null;
      if (!res.ok) {
        const p = (data ?? {}) as { detail?: string; code?: string; field?: string };
        throw new PagosRDError(p.detail ?? `Error HTTP ${res.status}`, res.status, p.code ?? "error_http", p.field, res.headers.get("x-request-id") ?? undefined, data);
      }
      return data as T;
    }
  }
}

const enc = encodeURIComponent;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt: number) => Math.min(8_000, 500 * 2 ** attempt) * (0.5 + Math.random() / 2);
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}
