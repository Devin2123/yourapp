-- CreateEnum
CREATE TYPE "public"."PayoutStatus" AS ENUM ('QUEUED', 'REQUESTED', 'SENT', 'CONFIRMED', 'FAILED');

-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "feeMinor" TEXT,
ADD COLUMN     "grossMinor" TEXT,
ADD COLUMN     "netMinor" TEXT;

-- CreateTable
CREATE TABLE "public"."Payout" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "serverId" TEXT NOT NULL,
    "orderId" TEXT,
    "amountMinor" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "externalId" TEXT,
    "txHash" TEXT,
    "status" "public"."PayoutStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payout_status_createdAt_idx" ON "public"."Payout"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "public"."Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
