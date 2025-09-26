/*
  Warnings:

  - A unique constraint covering the columns `[orderId]` on the table `Payout` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."Payout_serverId_idx";

-- AlterTable
ALTER TABLE "public"."Payout" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "txHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payout_orderId_key" ON "public"."Payout"("orderId");
