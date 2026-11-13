import { SIGNATURE_HEADER, verifyWebhook, WebhookSignatureError } from "./internal/index.js";
import type { Event } from "./types.js";

export { SIGNATURE_HEADER, WebhookSignatureError };

/**
 * Verifica la firma de un webhook y devuelve el evento tipado.
 *
 * IMPORTANTE: pasa el cuerpo CRUDO (string o Buffer), tal como llegó. Si tu
 * framework ya lo convirtió a JSON, la firma no va a coincidir.
 *
 * ```ts
 * app.post("/webhooks/pagosrd", express.raw({ type: "application/json" }), (req, res) => {
 *   const event = constructEvent(req.body, req.header("PagosRD-Signature"), process.env.PAGOSRD_WEBHOOK_SECRET!);
 *   if (event.type === "payment.succeeded") marcarCuotaPagada(event.data.payment_link_reference);
 *   res.sendStatus(200);
 * });
 * ```
 */
export function constructEvent(rawBody: string | Uint8Array, signatureHeader: string | null | undefined, secret: string, toleranceSeconds = 300): Event {
  const body = typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody);
  verifyWebhook(secret, body, signatureHeader, { toleranceSeconds });
  return JSON.parse(body) as Event;
}
