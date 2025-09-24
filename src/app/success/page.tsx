// src/app/success/page.tsx
"use client";

import React, { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic"; // avoid prerender attempts

type Status = "PENDING" | "PAID" | "FAILED" | "EXPIRED" | "CANCELED";
type Order = {
  id: string;
  status: Status;
  updatedAt: string;
  invoiceId: string | null;
  grossMinor?: string | null;
  feeMinor?: string | null;
  netMinor?: string | null;
};

function SuccessInner() {
  const sp = useSearchParams();
  const orderId = sp.get("order");

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!orderId) return;

    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let interval = 3000;

    const fetchOnce = async () => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;

      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(res.status === 404 ? "Order not found" : `Fetch failed: ${res.status}`);
        const data = (await res.json()) as Order;
        if (!mounted) return null;
        setOrder(data);
        setError(null);
        return data;
      } catch (e: unknown) {
        if (!mounted) return null;
        const msg = e instanceof Error ? e.message : "Unknown error";
        if (msg !== "The user aborted a request.") setError(msg);
        return null;
      }
    };

    const poll = async () => {
      const data = await fetchOnce();
      if (!mounted || !data) return;
      if (["PAID", "FAILED", "EXPIRED", "CANCELED"].includes(data.status)) return;
      interval = Math.min(interval + 1000, 10000);
      timer = setTimeout(poll, interval);
    };

    poll();
    return () => {
      mounted = false;
      ctrlRef.current?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [orderId]);

  if (!orderId) {
    return (
      <div className="max-w-xl mx-auto p-6 space-y-3">
        <h1 className="text-2xl font-semibold">Missing order reference</h1>
        <p>We didn’t get an order ID in the URL.</p>
        <Link className="underline" href="/products">Back to products</Link>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="max-w-xl mx-auto p-6 space-y-3">
        <h1 className="text-2xl font-semibold text-red-600">Error</h1>
        <p>{error}</p>
        <Link className="underline" href="/products">Back to products</Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-xl mx-auto p-6 space-y-3">
        <h1 className="text-2xl font-semibold">Checking payment status…</h1>
        <p>This page will update automatically.</p>
      </div>
    );
  }

  const refBlock = order.invoiceId ? (
    <p className="text-sm text-gray-500">Ref: {order.invoiceId}</p>
  ) : null;

  switch (order.status) {
    case "PAID": {
      const gross = order.grossMinor ? Number(order.grossMinor) : null;
      const fee = order.feeMinor ? Number(order.feeMinor) : null;
      const net = order.netMinor ? Number(order.netMinor) : null;

      return (
        <div className="max-w-xl mx-auto p-6 space-y-3">
          <h1 className="text-2xl font-semibold">Thanks! 🎉</h1>
          <p>Payment confirmed. Your Discord role should appear shortly.</p>
          {refBlock}
          {gross !== null && (
            <p className="text-sm text-gray-500">
              Gross: {gross} · Fee (3%): {fee ?? "—"} · Net to seller: {net ?? "—"} (minor units)
            </p>
          )}
          <Link className="underline" href="/products">Back to products</Link>
        </div>
      );
    }

    case "PENDING":
      return (
        <div className="max-w-xl mx-auto p-6 space-y-3">
          <h1 className="text-2xl font-semibold">Almost there…</h1>
          <p>Payment pending confirmation. This page will update automatically.</p>
          <p className="text-sm text-gray-500">You can safely close this tab and check back later.</p>
          {refBlock}
        </div>
      );

    case "EXPIRED":
      return (
        <div className="max-w-xl mx-auto p-6 space-y-3">
          <h1 className="text-2xl font-semibold">Payment link expired</h1>
          <p>Your checkout session expired before payment was confirmed.</p>
          {refBlock}
          <Link className="underline" href="/products">Try again</Link>
        </div>
      );

    default:
      return (
        <div className="max-w-xl mx-auto p-6 space-y-3">
          <h1 className="text-2xl font-semibold">Payment not completed</h1>
          <p>We didn’t receive a successful confirmation.</p>
          {refBlock}
          <Link className="underline" href="/products">Try again</Link>
        </div>
      );
  }
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-xl mx-auto p-6">
          <h1 className="text-2xl font-semibold">Loading…</h1>
        </div>
      }
    >
      <SuccessInner />
    </Suspense>
  );
}
