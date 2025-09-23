"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Status = "PENDING" | "PAID" | "FAILED" | "EXPIRED" | "CANCELED";
type Order = { id: string; status: Status; updatedAt: string; invoiceId: string | null };

export default function SuccessPage() {
  const sp = useSearchParams();
  const orderId = sp.get("order"); // we only trust this to look up the DB row
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch once + poll until terminal status
  useEffect(() => {
    if (!orderId) return;

    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchOnce = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const data = (await res.json()) as Order;
        if (mounted) setOrder(data);
        return data;
      } catch (e: any) {
        if (mounted) setError(e.message ?? "Unknown error");
        return null;
      }
    };

    const poll = async () => {
      const data = await fetchOnce();
      if (!data) return;
      // Stop on terminal states
      if (["PAID", "FAILED", "EXPIRED", "CANCELED"].includes(data.status)) return;
      timer = setTimeout(poll, 5000);
    };

    poll();

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [orderId]);

  // UI states
  if (!orderId) {
    return (
      <div className="max-w-xl mx-auto p-6 space-y-3">
        <h1 className="text-2xl font-semibold">Missing order reference</h1>
        <p>We didn’t get an order ID in the URL.</p>
        <a className="underline" href="/products">Back to products</a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto p-6 space-y-3">
        <h1 className="text-2xl font-semibold text-red-600">Error</h1>
        <p>{error}</p>
        <a className="underline" href="/products">Back to products</a>
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

  // Render based on DB truth
  switch (order.status) {
    case "PAID":
      return (
        <div className="max-w-xl mx-auto p-6 space-y-3">
          <h1 className="text-2xl font-semibold">Thanks! 🎉</h1>
          <p>Payment confirmed. Your Discord role should appear shortly.</p>
          {/* Optional: show invoice id for support */}
          {order.invoiceId && <p className="text-sm text-gray-500">Ref: {order.invoiceId}</p>}
          <a className="underline" href="/products">Back to products</a>
        </div>
      );

    case "PENDING":
      return (
        <div className="max-w-xl mx-auto p-6 space-y-3">
          <h1 className="text-2xl font-semibold">Almost there…</h1>
          <p>Payment pending confirmation from the network. This page will update automatically.</p>
          <p className="text-sm text-gray-500">If you closed your wallet, you can safely leave this tab and return later.</p>
        </div>
      );

    case "EXPIRED":
      return (
        <div className="max-w-xl mx-auto p-6 space-y-3">
          <h1 className="text-2xl font-semibold">Payment link expired</h1>
          <p>Your checkout session expired before payment was confirmed.</p>
          <a className="underline" href="/products">Try again</a>
        </div>
      );

    case "FAILED":
    case "CANCELED":
    default:
      return (
        <div className="max-w-xl mx-auto p-6 space-y-3">
          <h1 className="text-2xl font-semibold">Payment not completed</h1>
          <p>We didn’t receive a successful confirmation.</p>
          <a className="underline" href="/products">Try again</a>
        </div>
      );
  }
}
