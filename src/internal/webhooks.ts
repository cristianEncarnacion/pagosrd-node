import { hmacSha256Hex, randomToken, safeEqual } from "./crypto.js";

/**
 * Firma de los webhooks que PagosRD envía a las plataformas.
 *
 * Cabecera: `PagosRD-Signature: t=<unix>,v1=<hex>`
 * donde v1 = HMAC-SHA256(secreto, `${t}.${cuerpo}`).
 */

export const SIGNATURE_HEADER = "PagosRD-Signature";
export const DEFAULT_TOLERANCE_SECONDS = 300;

export class WebhookSignatureError extends Error {
  override readonly name = "WebhookSignatureError";
}

export function generateWebhookSecret(): string {
  return `whsec_${randomToken(32)}`;
}

export function signWebhook(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${hmacSha256Hex(secret, `${timestamp}.${body}`)}`;
}

/**
 * Verifica la firma de un webhook. Lanza WebhookSignatureError si no es válida.
 * Usa el cuerpo CRUDO tal como llegó (no el JSON re-serializado).
 */
export function verifyWebhook(
  secret: string,
  body: string,
  header: string | null | undefined,
  options: { toleranceSeconds?: number; now?: number } = {},
): void {
  if (!header) throw new WebhookSignatureError(`Falta la cabecera ${SIGNATURE_HEADER}.`);
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isInteger(t) || !v1) throw new WebhookSignatureError("Cabecera de firma con formato inválido.");
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(now - t) > tolerance) {
    throw new WebhookSignatureError("La firma es demasiado vieja o del futuro (posible reenvío malicioso).");
  }
  if (!safeEqual(hmacSha256Hex(secret, `${t}.${body}`), v1)) {
    throw new WebhookSignatureError("La firma no coincide.");
  }
}
