import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  // So you can check it in a browser
  return NextResponse.json({ ok: true, where: "maxelpay webhook endpoint" });
}

export async function POST(req: NextRequest) {
  try {
    // If MaxelPay later requires raw body for signature, we’ll switch to arrayBuffer()
    const body = await req.json();
    console.log("🔔 MaxelPay Webhook received:", body);

    // TODO: verify signature if MaxelPay provides one
    // TODO: look up order by invoiceId in body, mark as PAID, enqueue role grant

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Webhook error:", e);
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }
}
