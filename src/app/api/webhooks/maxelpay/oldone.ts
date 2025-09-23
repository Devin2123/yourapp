import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { verifyWebhook } from "@/src/lib/maxelpay";

export async function POST(req: NextRequest) {
  const raw = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get("x-maxelpay-signature") || undefined;

  if (!verifyWebhook(raw, signature)) return new NextResponse("Bad signature", { status: 400 });

  const event = JSON.parse(raw.toString("utf8"));
  if (event.type !== "payment.succeeded") return NextResponse.json({ ok: true });

  const invoiceId = event.data?.invoice_id as string | undefined;
  if (!invoiceId) return NextResponse.json({ ok: true });

  const order = await prisma.order.findFirst({ where: { invoiceId } });
  if (!order) return NextResponse.json({ ok: true });
  if (order.status === "PAID") return NextResponse.json({ ok: true });

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "PAID", grossWei: String(event.data?.amount_wei ?? "") }
  });

  // TODO: notify Discord bot to grant role.
  return NextResponse.json({ ok: true });
}
