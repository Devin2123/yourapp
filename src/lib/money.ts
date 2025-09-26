// src/lib/money.ts
export function dollarsToCents(input: string | number): number {
  const s = String(input).trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error("Invalid USD amount");
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return cents;
}
