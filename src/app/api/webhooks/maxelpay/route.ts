export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

const MOCK = process.env.MAXELPAY_MOCK === "true";
const SECRET = process.env.MAXELPAY_API_SECRET || "";
const FEE_BPS = Number(process.env.PLATFORM_FEE_BPS ?? 300); // 3%

type PaidEvent = {
  event_id?: string;
  id?: string;
  type?: string;
  data?: {
    invoice_id?: string | null;
    amount_minor?: string | null;
    asset?: string | null;
    chain?: string | null;
    metadata?: { order_id?: string | null } | null;
  };
};

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

function verifySignature(ts: string | null, sig: string | null, raw: string) {
  if (MOCK) return true;
  if (!ts || !sig || !SECRET) return false;
  const h = crypto.createHmac("sha256", SECRET).update(`${ts}.${raw}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(sig));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // read raw for HMAC
  const raw = await req.text();

  let evt: PaidEvent;
  try {
    evt = JSON.parse(raw) as PaidEvent;
  } catch {
    return bad("invalid json");
  }

  // verify signature unless mock mode
  const ok = verifySignature(
    req.headers.get("x-mx-timestamp"),
    req.headers.get("x-mx-signature"),
    raw
  );
  if (!ok) return bad("bad signature", 401);

  const deliveryId = String(evt.event_id ?? evt.id ?? "");
  const type = String(evt.type ?? "");

  // idempotency (deliveryId is unique)
  try {
    await prisma.webhookEvent.create({
      data: {
        deliveryId,
        type,
        raw: evt as unknown as object,
        invoiceId: evt?.data?.invoice_id ?? null,
      },
    });
  } catch {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (type === "invoice.paid") {
    const inv = evt?.data?.invoice_id ?? undefined;
    const metaOrderId = evt?.data?.metadata?.order_id ?? undefined;

    // 1) try metadata.order_id, 2) fall back to invoice_id
    const order =
      (metaOrderId
        ? await prisma.order.findUnique({
            where: { id: metaOrderId },
            include: { product: { include: { server: true } } },
          })
        : null) ||
      (inv
        ? await prisma.order.findFirst({
            where: { invoiceId: inv },
            include: { product: { include: { server: true } } },
          })
        : null);

    if (!order) {
      return NextResponse.json({ ok: true, note: "order not found" });
    }

    // amounts (minor units)
    const grossMinorStr = String(evt?.data?.amount_minor ?? "0");
    const gross = BigInt(grossMinorStr);
    const fee = (gross * BigInt(FEE_BPS)) / BigInt(10_000);
    const net = gross - fee;

    await prisma.$transaction(async (tx) => {
      // flip to PAID
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          grossMinor: gross.toString(),
          feeMinor: fee.toString(),
          netMinor: net.toString(),
        },
      });

      // enqueue payout (97%) if seller wallet exists
      const seller = order.product.server.payoutWallet;
      if (seller) {
        const exists = await tx.payout.findFirst({ where: { orderId: order.id } });
        if (!exists) {
          await tx.payout.create({
            data: {
              orderId: order.id,
              serverId: order.product.serverId,
              toAddress: seller,
              asset: order.product.currency,
              chain: order.product.chain ?? "POLYGON",
              amountMinor: net.toString(),
              status: "QUEUED",
            },
          });
        }
      }

      // enqueue Discord role grant
      if (order.buyerDiscordId && order.product.roleId) {
        const already = await tx.roleGrant.findFirst({
          where: { orderId: order.id, discordId: order.buyerDiscordId },
        });
        if (!already) {
          await tx.roleGrant.create({
            data: {
              orderId: order.id,
              productId: order.productId,
              discordId: order.buyerDiscordId,
              status: "QUEUED",
            },
          });
        }
      }

      // backfill WebhookEvent with orderId
      await tx.webhookEvent.update({
        where: { deliveryId },
        data: { orderId: order.id, invoiceId: inv ?? order.invoiceId ?? null },
      });
    });

    return NextResponse.json({ ok: true });
  }

  if (type === "invoice.expired" || type === "invoice.canceled") {
    const inv = evt?.data?.invoice_id ?? undefined;
    if (inv) {
      await prisma.order.updateMany({
        where: { invoiceId: inv, status: { in: ["PENDING"] } },
        data: { status: type === "invoice.expired" ? "EXPIRED" : "CANCELED" },
      });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: type });
}
