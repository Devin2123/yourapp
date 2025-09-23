// src/app/products/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import BuyButton from "@/components/BuyButton";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params; // <-- await params in Next 15

  const product = await prisma.product.findUnique({
    where: { id },
    include: { server: true },
  });

  if (!product || !product.active) {
    notFound();
  }

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">{product.name}</h1>
      {product.description && (
        <p className="text-gray-600 mt-2">{product.description}</p>
      )}

      <div className="mt-6">
        <BuyButton productId={product.id} />
      </div>

      <p className="mt-8 text-sm text-gray-500">
        Splitter address:{" "}
        <Link
          className="underline"
          href={`${process.env.EXPLORER_BASE}/address/${product.server.splitterAddress}`}
          target="_blank"
        >
          {product.server.splitterAddress}
        </Link>
      </p>
    </main>
  );
}
