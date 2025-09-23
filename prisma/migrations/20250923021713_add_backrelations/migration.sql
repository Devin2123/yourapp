/*
  Warnings:

  - The `status` column on the `Order` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "public"."OrderStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."RoleGrantStatus" AS ENUM ('QUEUED', 'DONE', 'FAILED');

-- DropForeignKey
ALTER TABLE "public"."Order" DROP CONSTRAINT "Order_productId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Product" DROP CONSTRAINT "Product_serverId_fkey";

-- AlterTable
ALTER TABLE "public"."Order" DROP COLUMN "status",
ADD COLUMN     "status" "public"."OrderStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "public"."WebhookEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "invoiceId" TEXT,
    "orderId" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RoleGrant" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "status" "public"."RoleGrantStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "RoleGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_deliveryId_key" ON "public"."WebhookEvent"("deliveryId");

-- CreateIndex
CREATE INDEX "WebhookEvent_invoiceId_idx" ON "public"."WebhookEvent"("invoiceId");

-- CreateIndex
CREATE INDEX "WebhookEvent_type_createdAt_idx" ON "public"."WebhookEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "RoleGrant_status_updatedAt_idx" ON "public"."RoleGrant"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "RoleGrant_discordId_idx" ON "public"."RoleGrant"("discordId");

-- CreateIndex
CREATE INDEX "Order_status_updatedAt_idx" ON "public"."Order"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Order_invoiceId_idx" ON "public"."Order"("invoiceId");

-- CreateIndex
CREATE INDEX "Product_serverId_idx" ON "public"."Product"("serverId");

-- CreateIndex
CREATE INDEX "Product_active_createdAt_idx" ON "public"."Product"("active", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "public"."Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WebhookEvent" ADD CONSTRAINT "WebhookEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoleGrant" ADD CONSTRAINT "RoleGrant_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoleGrant" ADD CONSTRAINT "RoleGrant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
