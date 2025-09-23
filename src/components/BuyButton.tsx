// src/components/BuyButton.tsx
"use client";
import { useState } from "react";

export default function BuyButton({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false);

  const onBuy = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });

      let data: any = null;
      let text = "";
      try { data = await res.json(); } catch { text = await res.text(); }
      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || text || "Checkout failed";
        throw new Error(msg);
      }

      const url = data?.checkoutUrl;
      if (!url) throw new Error("No checkout URL received");
      window.location.href = url;
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={onBuy} disabled={loading} className="px-6 py-3 rounded-lg bg-black text-white disabled:opacity-60">
      {loading ? "Preparing checkout…" : "Buy Now"}
    </button>
  );
}
