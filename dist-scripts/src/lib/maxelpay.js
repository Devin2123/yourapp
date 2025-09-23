"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInvoice = createInvoice;
// src/lib/maxelpay.ts
const crypto_js_1 = __importDefault(require("crypto-js"));
const BASE = (process.env.MAXELPAY_API_BASE || "").trim();
const ENV = (process.env.MAXELPAY_ENV || "stg").trim(); // stg | prod
const APIKEY = (process.env.MAXELPAY_API_KEY || "").trim();
const SECRET = (process.env.MAXELPAY_API_SECRET || "").trim();
const MOCK = (process.env.MAXELPAY_MOCK || "").toLowerCase() === "true";
function encryptWithSecret(secret, payloadStr) {
    if (!secret || secret.length < 16) {
        throw new Error("MAXELPAY_API_SECRET must be at least 16 characters");
    }
    const key = crypto_js_1.default.enc.Utf8.parse(secret); // AES-256 expects 32-byte key; CryptoJS will use the bytes provided
    const iv = crypto_js_1.default.enc.Utf8.parse(secret.substr(0, 16)); // IV = first 16 chars (per MaxelPay example)
    const encrypted = crypto_js_1.default.AES.encrypt(payloadStr, key, {
        iv,
        mode: crypto_js_1.default.mode.CBC,
        padding: crypto_js_1.default.pad.Pkcs7,
    });
    return encrypted.toString(); // base64
}
async function createInvoice(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    if (MOCK) {
        console.warn("[MaxelPay] MOCK mode enabled — returning stub checkout URL");
        return { invoiceId: `mock_${input.orderId}`, checkoutUrl: "https://example.com/checkout/mock" };
    }
    if (!BASE)
        throw new Error("Missing env MAXELPAY_API_BASE");
    if (!APIKEY)
        throw new Error("Missing env MAXELPAY_API_KEY");
    if (!SECRET)
        throw new Error("Missing env MAXELPAY_API_SECRET");
    const endpoint = `${BASE}/v1/${ENV}/merchant/order/checkout`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    // Build the exact payload MaxelPay shows in their example
    const payload = {
        orderID: input.orderId,
        amount: input.amount,
        currency: input.currency,
        timestamp,
        userName: input.userName,
        siteName: input.siteName,
        userEmail: input.userEmail,
        redirectUrl: input.redirectUrl,
        websiteUrl: input.websiteUrl,
        cancelUrl: input.cancelUrl,
        webhookUrl: input.webhookUrl,
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
    let data = {};
    try {
        data = JSON.parse(text);
    }
    catch ( /* tolerate non-JSON */_o) { /* tolerate non-JSON */ }
    const invoiceId = (_e = (_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.order_id) !== null && _a !== void 0 ? _a : data === null || data === void 0 ? void 0 : data.invoice_id) !== null && _b !== void 0 ? _b : data === null || data === void 0 ? void 0 : data.id) !== null && _c !== void 0 ? _c : (_d = data === null || data === void 0 ? void 0 : data.data) === null || _d === void 0 ? void 0 : _d.id) !== null && _e !== void 0 ? _e : input.orderId; // fall back to our order id
    const checkoutUrl = (_l = (_j = (_h = (_g = (_f = data === null || data === void 0 ? void 0 : data.payment_url) !== null && _f !== void 0 ? _f : data === null || data === void 0 ? void 0 : data.checkout_url) !== null && _g !== void 0 ? _g : data === null || data === void 0 ? void 0 : data.url) !== null && _h !== void 0 ? _h : data === null || data === void 0 ? void 0 : data.result) !== null && _j !== void 0 ? _j : (_k = data === null || data === void 0 ? void 0 : data.data) === null || _k === void 0 ? void 0 : _k.payment_url) !== null && _l !== void 0 ? _l : (_m = data === null || data === void 0 ? void 0 : data.data) === null || _m === void 0 ? void 0 : _m.url;
    if (!checkoutUrl) {
        console.warn("[MaxelPay] Unknown response shape:", text);
        throw new Error("Missing checkout URL in response");
    }
    return { invoiceId, checkoutUrl };
}
