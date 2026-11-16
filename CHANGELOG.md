# Cambios

## 0.1.2 (15-nov-2026)

- `subscriptions.advance(id)`: solo con una llave de prueba, el siguiente cobro de una suscripción sale en el próximo minuto sin esperar su fecha (para probar los cobros recurrentes y sus webhooks).

## 0.1.1 (13-nov-2026)

- Tipos nuevos: `Merchant.saved_cards_enabled`, `Merchant.processor_account_shared_with` y `Refund.recorded_manually` (reembolso hecho en el portal del procesador y registrado en PagosRD).
- `package.json` enlaza el repositorio público.

## 0.1.0 (12-nov-2026)

- Primera versión: links de cobro, pagos, reembolsos, tarjetas guardadas, suscripciones, eventos y verificación de webhooks.
