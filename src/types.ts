/** Tipos de los objetos de la API de PagosRD. Montos en centavos. */

export type Livemode = boolean;

export interface List<T> {
  object: "list";
  data: T[];
  has_more: boolean;
}

/** Lo que el tarjetahabiente ve antes de pagar (requisito de Visa y Mastercard). */
export interface CustomerInfo {
  support_email: string | null;
  support_phone: string | null;
  address_line: string | null;
  address_city: string | null;
  /** País, ISO 3166-1 alfa-2 (por ejemplo "DO"). */
  address_country: string;
  refund_policy: string | null;
  delivery_policy: string | null;
}

/** Campos omitidos no cambian; null o "" los borra. En live son obligatorios todos. */
export type CustomerInfoParams = Partial<Omit<CustomerInfo, "address_country">> & { address_country?: string };

export interface Merchant {
  id: string;
  object: "merchant";
  livemode: Livemode;
  name: string;
  rnc: string | null;
  external_id: string | null;
  processor: "simulador" | "azul" | "cardnet";
  processor_configured: boolean;
  processor_summary: Record<string, string>;
  /** true si los links de este comercio pueden guardar la tarjeta para cobros automáticos y suscripciones. */
  saved_cards_enabled: boolean;
  status: "active" | "disabled";
  metadata: Record<string, string>;
  customer_info: CustomerInfo;
  /** true si ya tiene contacto, dirección y políticas: lo necesario para cobrar en vivo. */
  customer_info_complete: boolean;
  /** Otros comercios de la plataforma que cobran en vivo con la misma cuenta del procesador. Solo al consultar, crear o modificar un comercio. */
  processor_account_shared_with?: { id: string; name: string }[];
  created_at: string;
  updated_at: string;
}

export interface AzulConfig {
  environment: "pruebas" | "produccion";
  merchant_id: string;
  auth1: string;
  auth2: string;
  certificate_pem: string;
  private_key_pem: string;
  payment_page: { auth_key: string; merchant_name: string; merchant_type: string };
}

export interface CardnetConfig {
  environment: "certificacion" | "produccion";
  merchant_number: string;
  merchant_terminal: string;
  merchant_terminal_amex?: string;
  merchant_type: string;
  merchant_name: string;
  acquiring_institution_code?: string;
}

export interface PaymentLink {
  id: string;
  object: "payment_link";
  livemode: Livemode;
  url: string;
  merchant_id: string;
  amount: number;
  itbis: number;
  currency: "DOP" | "USD";
  description: string;
  reference: string | null;
  customer: { name: string | null; email: string | null; phone: string | null; reference: string | null };
  /** true si la tarjeta con la que se pague queda guardada. */
  save_payment_method: boolean;
  locale: "es" | "en";
  success_url: string | null;
  status: "open" | "paid" | "expired" | "canceled";
  expires_at: string | null;
  paid_at: string | null;
  payment_id: string | null;
  metadata: Record<string, string>;
  created_at: string;
}

export type PaymentStatus = "pending" | "processing" | "succeeded" | "failed" | "canceled";

export interface Payment {
  id: string;
  object: "payment";
  livemode: Livemode;
  merchant_id: string;
  payment_link_id: string | null;
  /** Tarjeta guardada con la que se cobró (cobros por API). */
  payment_method_id: string | null;
  /** Concepto del cobro por API; en los pagos de un link está en el link. */
  description: string | null;
  reference: string | null;
  /** Serie recurrente del cobro con tarjeta guardada; null en links y compras puntuales. */
  recurring: RecurringType | null;
  /** customer = lo inició el cliente (CIT); merchant = lo inició el comercio sobre una serie ya autorizada (MIT). */
  initiated_by: "customer" | "merchant" | null;
  /** Suscripción que generó este cobro. */
  subscription_id: string | null;
  /** Periodo de la suscripción que cobra (1 = el primero). */
  subscription_period: number | null;
  amount: number;
  itbis: number;
  amount_refunded: number;
  itbis_refunded: number;
  currency: "DOP" | "USD";
  status: PaymentStatus;
  requires_review: boolean;
  processor: "simulador" | "azul" | "cardnet";
  order_number: string;
  processor_order_id: string | null;
  authorization_code: string | null;
  card: { brand: string | null; last4: string } | null;
  failure_code: string | null;
  failure_message: string | null;
  metadata: Record<string, string>;
  paid_at: string | null;
  created_at: string;
}

/** Tarjeta guardada (DataVault de AZUL o el simulador). El token nunca sale de PagosRD. */
export interface PaymentMethod {
  id: string;
  object: "payment_method";
  livemode: Livemode;
  merchant_id: string;
  /** Id del cliente en tu sistema. */
  customer_reference: string;
  processor: "simulador" | "azul" | "cardnet";
  card: { brand: string | null; last4: string | null; exp_month: number | null; exp_year: number | null };
  status: "active" | "deleted";
  source_payment_id: string | null;
  created_at: string;
  deleted_at: string | null;
}

export type SubscriptionStatus = "active" | "past_due" | "unpaid" | "canceled" | "completed";

/**
 * Cobro automático y periódico con una tarjeta guardada. PagosRD crea cada cobro en
 * su fecha; cada uno llega como `payment.succeeded` o `payment.failed` con `subscription_id`.
 */
export interface Subscription {
  id: string;
  object: "subscription";
  livemode: Livemode;
  merchant_id: string;
  payment_method_id: string;
  customer_reference: string;
  kind: RecurringType;
  description: string;
  reference: string | null;
  metadata: Record<string, string>;
  amount: number;
  itbis: number;
  currency: "DOP" | "USD";
  interval: "week" | "month";
  interval_count: number;
  start_at: string;
  total_charges: number | null;
  charges_count: number;
  /** active al día; past_due reintentando; unpaid sin más reintentos (reactívala con retry o cambiando la tarjeta); canceled; completed. */
  status: SubscriptionStatus;
  next_charge_at: string | null;
  failed_attempts: number;
  /** Periodo que se está cobrando o el próximo (1 = el primero). */
  current_period: number;
  /** Cobro en curso esperando la confirmación del procesador. */
  pending_payment_id: string | null;
  last_payment_id: string | null;
  last_failure: { code: string; message: string | null } | null;
  canceled_at: string | null;
  created_at: string;
}

export interface CreateSubscriptionParams {
  payment_method_id: string;
  /** Monto de cada cobro en centavos, ITBIS incluido. */
  amount: number;
  itbis?: number;
  description: string;
  reference?: string | null;
  metadata?: Record<string, string>;
  interval: "week" | "month";
  /** Cada cuántos intervalos (por defecto 1). */
  interval_count?: number;
  /** Por defecto subscription (monto fijo). installment exige total_charges. */
  kind?: RecurringType;
  total_charges?: number | null;
  /** ISO 8601. Fecha del primer cobro; por defecto, ahora. */
  start_at?: string | null;
}

export interface UpdateSubscriptionParams {
  /** Otra tarjeta del mismo cliente. Reactiva una suscripción past_due o unpaid. */
  payment_method_id?: string;
  amount?: number;
  itbis?: number;
  description?: string;
  reference?: string | null;
  metadata?: Record<string, string>;
}

export interface Refund {
  id: string;
  object: "refund";
  livemode: Livemode;
  payment_id: string;
  amount: number;
  itbis: number;
  reason: string | null;
  status: "pending" | "succeeded" | "failed";
  failure_message: string | null;
  /** true si el reembolso se hizo en el portal del procesador y aquí solo se registró. */
  recorded_manually: boolean;
  created_at: string;
}

export type EventType =
  | "payment.succeeded"
  | "payment.failed"
  | "payment.requires_review"
  | "payment_link.paid"
  | "payment_link.expired"
  | "payment_link.canceled"
  | "refund.succeeded"
  | "refund.failed"
  | "payment_method.created"
  | "payment_method.deleted"
  | "subscription.created"
  | "subscription.updated"
  | "subscription.past_due"
  | "subscription.period_unpaid"
  | "subscription.unpaid"
  | "subscription.canceled"
  | "subscription.completed";

interface EventBase<T extends EventType, D> {
  id: string;
  object: "event";
  livemode: Livemode;
  type: T;
  data: D;
  created_at: string;
}

/** Evento de webhook. `type` discrimina el contenido de `data`. */
export type Event =
  | EventBase<"payment.succeeded", { object: Payment; payment_link_reference: string | null; saved_payment_method: PaymentMethod | null }>
  | EventBase<"payment.failed" | "payment.requires_review", { object: Payment }>
  | EventBase<"payment_link.paid" | "payment_link.expired" | "payment_link.canceled", { object: PaymentLink }>
  | EventBase<"refund.succeeded", { object: Refund; payment: Payment }>
  | EventBase<"refund.failed", { object: Refund }>
  | EventBase<"payment_method.created", { object: PaymentMethod; payment_id: string }>
  | EventBase<"payment_method.deleted", { object: PaymentMethod }>
  | EventBase<
      "subscription.created" | "subscription.updated" | "subscription.past_due" | "subscription.unpaid" | "subscription.canceled" | "subscription.completed",
      { object: Subscription }
    >
  /** Un periodo venció sin cobrarse (se agotó su tiempo o sus reintentos). Cóbralo por otra vía si corresponde. */
  | EventBase<"subscription.period_unpaid", { object: Subscription; periods: Array<{ period: number; due_at: string; amount: number }> }>;

export interface WebhookEndpoint {
  id: string;
  object: "webhook_endpoint";
  livemode: Livemode;
  url: string;
  description: string | null;
  events: string[];
  enabled: boolean;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  object: "webhook_delivery";
  event_id: string;
  event_type: string | null;
  endpoint_id: string;
  status: "pending" | "succeeded" | "failed";
  attempts: number;
  last_response_status: number | null;
  last_response_body: string | null;
  last_error: string | null;
  next_attempt_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface Summary {
  object: "summary";
  from: string;
  to: string;
  succeeded_count: number;
  succeeded_amount: number;
  refunded_amount: number;
  failed_count: number;
  review_count: number;
  daily: { day: string; amount: number; count: number }[];
}

// ------------------------------------------------------------------ entradas

export interface PageParams {
  limit?: number;
  starting_after?: string;
}

export interface CreatePaymentLinkParams {
  merchant_id: string;
  /** Total en centavos, ITBIS incluido. 450000 = RD$4,500.00 */
  amount: number;
  itbis?: number;
  description: string;
  reference?: string | null;
  /** `reference` = id del cliente en tu sistema; obligatorio con save_payment_method. */
  customer?: { name?: string | null; email?: string | null; phone?: string | null; reference?: string | null };
  /** Guardar la tarjeta con la que se pague para cobrar después con payments.create. */
  save_payment_method?: boolean;
  locale?: "es" | "en";
  success_url?: string | null;
  expires_at?: string | null;
  metadata?: Record<string, string>;
}

export interface CreateMerchantParams {
  name: string;
  rnc?: string | null;
  external_id?: string | null;
  processor: "simulador" | "azul" | "cardnet";
  processor_config?: AzulConfig | CardnetConfig;
  customer_info?: CustomerInfoParams;
  metadata?: Record<string, string>;
}

export interface CreatePaymentParams {
  payment_method_id: string;
  /** Total en centavos, ITBIS incluido. */
  amount: number;
  itbis?: number;
  description: string;
  reference?: string | null;
  metadata?: Record<string, string>;
  /**
   * Serie recurrente del cobro. Sin él es una compra puntual con el cliente presente,
   * que con AZUL todavía no está disponible (necesita 3D Secure).
   */
  recurring?: RecurringType;
}

/** subscription = monto y frecuencia fijos; standing_order = monto variable, frecuencia fija; installment = cuotas. */
export type RecurringType = "subscription" | "standing_order" | "installment";

export interface CreateRefundParams {
  amount?: number;
  itbis?: number;
  reason?: string | null;
}

export interface RequestOptions {
  /** Llave de idempotencia propia. Si no la pasas, el SDK genera una por solicitud. */
  idempotencyKey?: string;
}
