// src/app/api/invoices/route.ts
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

    // Load product (and its server for later flows)
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { server: true },
    });
    if (!product || !product.active) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Require seller-set price in cents (USD)
    const cents = Number(product.priceMinor);
    if (!Number.isFinite(cents) || cents <= 0) {
      return NextResponse.json({ error: "Product is missing a valid price" }, { status: 400 });
    }
    // Convert to "12.99" style string for MaxelPay
    const amountUsd = (cents / 100).toFixed(2);

    // Create order first (PENDING)
    const order = await prisma.order.create({
      data: { productId, buyerDiscordId },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    // Create the MaxelPay invoice
    const invoice = await createInvoice({
      orderId: order.id,
      amount: amountUsd,           // ← seller-controlled USD price
      currency: "USD",
      userName: username,
      userEmail: email,
      siteName: "YourBrand",
      redirectUrl: `${appUrl}/success?order=${order.id}`,
      cancelUrl: `${appUrl}/products/${product.id}?canceled=1`,
      websiteUrl: appUrl,
      webhookUrl: process.env.MAXELPAY_WEBHOOK_URL || `${appUrl}/api/webhooks/maxelpay`,
      // Helps the webhook find the order even if invoice_id differs
      // If your CreateInvoiceInput doesn't include `metadata` yet,
      // either add it there or keep this file's call typed as `any`.
      metadata: { order_id: order.id, product_id: product.id },
    } as any);

    // Persist invoice id back on the order
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
