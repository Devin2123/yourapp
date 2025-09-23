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
      amount: "10",              // TODO: replace with your real pricing
      currency: "USD",
      userName: username,
      userEmail: email,
      siteName: "YourBrand",     // your brand name here
      redirectUrl: `${appUrl}/success?order=${order.id}`,
      cancelUrl: `${appUrl}/products/${product.id}?canceled=1`,
      websiteUrl: appUrl,
      webhookUrl: process.env.MAXELPAY_WEBHOOK_URL || `${appUrl}/api/webhooks/maxelpay`,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { invoiceId: invoice.invoiceId },
    });

    return NextResponse.json({ orderId: order.id, checkoutUrl: invoice.checkoutUrl });
  } catch (err: any) {
    console.error("Create invoice error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
  }
}
