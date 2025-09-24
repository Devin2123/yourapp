export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createInvoice } from "@/lib/maxelpay";

const Body = z.object({
  productId: z.string(),
  buyerDiscordId: z.string().optional(),
  email: z.string().email().optional().default("buyer@example.com"),
  username: z.string().optional().default("DiscordBuyer"),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { productId, buyerDiscordId, email, username } = Body.parse(json);

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { server: true },
    });
    if (!product || !product.active) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const order = await prisma.order.create({
      data: { productId, buyerDiscordId },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const invoice = await createInvoice({
      orderId: order.id,
      amount: "10",
      currency: "USD",
      userName: username,
      userEmail: email,
      siteName: "YourBrand",
      redirectUrl: `${appUrl}/success?order=${order.id}`,
      cancelUrl: `${appUrl}/products/${product.id}?canceled=1`,
      websiteUrl: appUrl,
      webhookUrl:
        process.env.MAXELPAY_WEBHOOK_URL || `${appUrl}/api/webhooks/maxelpay`,
      // 👇 helps the webhook find the order even if invoice_id differs
      // (Make sure CreateInvoiceInput has `metadata?: Record<string,string>`.)
      metadata: { order_id: order.id, product_id: product.id },
    } as any); // keep `as any` if your lib type doesn't have `metadata` yet

    await prisma.order.update({
      where: { id: order.id },
      data: { invoiceId: invoice.invoiceId },
    });

    return NextResponse.json({
      orderId: order.id,
      checkoutUrl: invoice.checkoutUrl,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("Create invoice error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
