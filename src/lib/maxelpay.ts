// src/lib/maxelpay.ts
import CryptoJS from "crypto-js";

const BASE   = (process.env.MAXELPAY_API_BASE || "").trim();
const ENV    = (process.env.MAXELPAY_ENV || "stg").trim(); // stg | prod
const APIKEY = (process.env.MAXELPAY_API_KEY || "").trim();
const SECRET = (process.env.MAXELPAY_API_SECRET || "").trim();
const MOCK   = (process.env.MAXELPAY_MOCK || "").toLowerCase() === "true";

export type CreateInvoiceInput = {
  orderId: string;
  amount: string;       // e.g. "10"
  currency: string;     // e.g. "USD"
  userName: string;
  userEmail: string;
  siteName: string;
  redirectUrl: string;
  cancelUrl: string;
  websiteUrl: string;
  webhookUrl: string;
};

export type CreateInvoiceResult = {
  invoiceId: string;
  checkoutUrl: string;
};

function encryptWithSecret(secret: string, payloadStr: string) {
  if (!secret || secret.length < 16) {
    throw new Error("MAXELPAY_API_SECRET must be at least 16 characters");
  }
  const key = CryptoJS.enc.Utf8.parse(secret);              // AES-256 expects 32-byte key; CryptoJS will use the bytes provided
  const iv  = CryptoJS.enc.Utf8.parse(secret.substr(0, 16)); // IV = first 16 chars (per MaxelPay example)
  const encrypted = CryptoJS.AES.encrypt(payloadStr, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return encrypted.toString(); // base64
}

export async function createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  if (MOCK) {
    console.warn("[MaxelPay] MOCK mode enabled — returning stub checkout URL");
    return { invoiceId: `mock_${input.orderId}`, checkoutUrl: "https://example.com/checkout/mock" };
  }
  if (!BASE)   throw new Error("Missing env MAXELPAY_API_BASE");
  if (!APIKEY) throw new Error("Missing env MAXELPAY_API_KEY");
  if (!SECRET) throw new Error("Missing env MAXELPAY_API_SECRET");

  const endpoint = `${BASE}/v1/${ENV}/merchant/order/checkout`;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Build the exact payload MaxelPay shows in their example
  const payload = {
    orderID:     input.orderId,
    amount:      input.amount,
    currency:    input.currency,
    timestamp,
    userName:    input.userName,
    siteName:    input.siteName,
    userEmail:   input.userEmail,
    redirectUrl: input.redirectUrl,
    websiteUrl:  input.websiteUrl,
    cancelUrl:   input.cancelUrl,
    webhookUrl:  input.webhookUrl,
  };

  const encrypted = encryptWithSecret(SECRET, JSON.stringify(payload));
  const body = JSON.stringify({ data: encrypted });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "api-key": APIKEY,
      "Content-Type": "application/json",
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`MaxelPay create invoice failed: ${res.status} ${text}`);
  }

  // Response keys vary; map common options. If you see different, paste it and we’ll align.
  let data: any = {};
  try { data = JSON.parse(text); } catch { /* tolerate non-JSON */ }

  const invoiceId =
  data?.order_id ??
  data?.invoice_id ??
  data?.id ??
  data?.data?.id ??
  input.orderId; // fall back to our order id

const checkoutUrl =
  data?.payment_url ??
  data?.checkout_url ??
  data?.url ??
  data?.result ??            // <-- their current response
  data?.data?.payment_url ?? // safety for nested responses
  data?.data?.url;

if (!checkoutUrl) {
  console.warn("[MaxelPay] Unknown response shape:", text);
  throw new Error("Missing checkout URL in response");
}

return { invoiceId, checkoutUrl };
}
