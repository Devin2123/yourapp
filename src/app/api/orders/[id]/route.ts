export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/orders/:id
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }   // 👈 params is a Promise in Next 15
) {
  try {
    const { id } = await ctx.params;         // 👈 await it
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        invoiceId: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json(order);
  } catch (err: unknown) {
  console.error("Error fetching order:", err);
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
}
