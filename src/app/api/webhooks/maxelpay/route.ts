// app/api/webhooks/maxelpay/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";

const MAXEL_SECRET = process.env.MAXELPAY_API_SECRET || "";
const PLATFORM_FEE_BPS = Number(process.env.PLATFORM_FEE_BPS ?? "300"); // 3% default

function safeEqual(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

// Example HMAC verifier; swap to MaxelPay's exact header names/scheme.
function verify(req: NextRequest, raw: string) {
  // e.g., X-MX-Signature, X-MX-Timestamp
  const sig = req.headers.get("x-mx-signature") || "";
  const ts = req.headers.get("x-mx-timestamp") || "";
  if (!sig || !ts || !MAXEL_SECRET) return false;
  const mac = crypto.createHmac("sha256", MAXEL_SECRET).update(`${ts}.${raw}`).digest("hex");
  return safeEqual(sig, mac);
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();

    // Allow bypass while testing
    const mock = process.env.MAXELPAY_MOCK === "true";
    if (!mock && !verify(req, raw)) {
      return NextResponse.json({ error: "bad signature" }, { status: 400 });
    }

    const evt = JSON.parse(raw) as {
      event_id?: string;
      type: string;
      data: {
        invoice_id: string;
        amount_minor?: string; // smallest units
        asset?: string;        // "USDC" | "NATIVE"
        chain?: string;        // "POLYGON"
        metadata?: any;
        status?: string;
        tx_hash?: string;
      };
    };

    // Persist the raw event for idempotency/forensics
    if (evt.event_id) {
      try {
        await prisma.webhookEvent.create({
          data: {
            deliveryId: evt.event_id,
            type: evt.type,
            invoiceId: evt.data?.invoice_id ?? null,
            orderId: evt.data?.metadata?.order_id ?? null,
            raw: evt as any,
          },
        });
      } catch {
        // duplicate delivery id -> idempotent ack
        return NextResponse.json({ ok: true });
      }
    }

    if (evt.type === "invoice.paid") {
      const inv = evt.data.invoice_id;
      const order = await prisma.order.findFirst({
        where: { invoiceId: inv },
        include: { product: { include: { server: true } } },
      });

      if (!order) {
        // Unknown invoice: ack to avoid retries
        return NextResponse.json({ ok: true, note: "order not found" });
      }

      // Mark paid (idempotent)
      if (order.status !== "PAID") {
        await prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } });
      }

      // Amounts (smallest unit strings)
      // Prefer webhook's amount_minor; fallback to product.priceWei (works for native) if needed.
      const gross = BigInt(evt.data.amount_minor ?? order.grossMinor ?? order.grossWei ?? "0");
      const fee = (gross * BigInt(PLATFORM_FEE_BPS)) / BigInt(10_000);
      const net = gross - fee;

      await prisma.order.update({
        where: { id: order.id },
        data: {
          grossMinor: gross.toString(),
          feeMinor: fee.toString(),
          netMinor: net.toString(),
        },
      });

      // Enqueue one payout of 97% to the seller's address
      const server = order.product.server;
      const sellerAddress = server.payoutWallet;
      if (sellerAddress && net > 0n) {
        await prisma.payout.create({
          data: {
            serverId: server.id,
            orderId: order.id,
            amountMinor: net.toString(),
            asset: evt.data.asset ?? order.product.currency, // e.g. "USDC" or "NATIVE"
            chain: evt.data.chain ?? server.chain,           // e.g. "POLYGON"
            toAddress: sellerAddress,
            status: "QUEUED",
          },
        });
      }

      return NextResponse.json({ ok: true });
    }

    // (Optional) handle expired/failed to mark orders
    if (evt.type === "invoice.expired") {
      const inv = evt.data.invoice_id;
      await prisma.order.updateMany({
        where: { invoiceId: inv, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("MaxelPay webhook error:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
