# @pagosrd/node

Cliente oficial de PagosRD para Node.js 18+. Sin dependencias.

```bash
pnpm add @pagosrd/node
```

```ts
import { PagosRD, constructEvent, toCents } from "@pagosrd/node";

const pagosrd = new PagosRD(process.env.PAGOSRD_API_KEY!);

const link = await pagosrd.paymentLinks.create({
  merchant_id: "mer_…",
  amount: toCents("4,500.00"),
  description: "Cuota de mantenimiento octubre 2026",
  reference: "cuota-4b-2026-10",
});
console.log(link.url); // envíaselo al cliente

for await (const pago of pagosrd.autoPaginate((p) => pagosrd.payments.list({ ...p, status: "succeeded" }))) {
  console.log(pago.id, pago.amount);
}
```

- **Idempotencia y reintentos:** cada POST lleva una `Idempotency-Key`. Ante fallas de red, 429 o 5xx, el cliente reintenta con la misma llave, así que nunca duplica un cobro ni un reembolso.
- **Errores:** `PagosRDError` (con `status`, `code`, `field`, `requestId`) y `PagosRDConnectionError`.
- **Webhooks:** `constructEvent(cuerpoCrudo, cabeceraFirma, secreto)` verifica la firma y devuelve el evento tipado.

Guía completa: `docs/integracion.md`.

Licencia MIT.
