/** Monto en centavos enteros. Solo se crea con `cents()`, que valida. */
export type Cents = number & { readonly __brand: "Cents" };

export const CURRENCIES = ["DOP", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export class MoneyError extends Error {
  override readonly name = "MoneyError";
}

/** Valida y marca un entero de centavos. */
export function cents(value: number, field = "amount"): Cents {
  if (!Number.isSafeInteger(value)) throw new MoneyError(`${field} debe ser un entero de centavos.`);
  if (value < 0) throw new MoneyError(`${field} no puede ser negativo.`);
  return value as Cents;
}

/** Convierte "1,500.50" o "RD$1,500.50" a 150050 sin pasar por punto flotante. */
export function toCents(amount: string | number): Cents {
  const text = typeof amount === "number" ? amount.toString() : amount;
  const noSymbol = text.trim().replace(/^(RD\$|US\$|\$)\s*/i, "");
  // La coma SOLO se acepta como separador de miles bien formado ("1,500.50").
  // "1500,50" o "4,5" se rechazan: podrían ser decimales y multiplicar el monto por 100.
  if (noSymbol.includes(",") && !/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(noSymbol)) {
    throw new MoneyError(`Monto ambiguo: "${text}". Usa punto para los decimales y coma solo para los miles, por ejemplo "1,500.50".`);
  }
  const cleaned = noSymbol.replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) throw new MoneyError(`Monto inválido: "${text}". Usa como máximo 2 decimales.`);
  const value = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents(value);
}

const formatters = new Map<Currency, Intl.NumberFormat>();

/** 150050 -> "RD$1,500.50" */
export function formatMoney(value: number, currency: Currency = "DOP"): string {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("es-DO", { style: "currency", currency, minimumFractionDigits: 2 });
    formatters.set(currency, f);
  }
  return f.format(value / 100);
}
