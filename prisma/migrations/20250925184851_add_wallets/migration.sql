/*
  Warnings:

  - You are about to drop the column `attempts` on the `Payout` table. All the data in the column will be lost.
  - You are about to drop the column `externalId` on the `Payout` table. All the data in the column will be lost.
  - You are about to drop the column `lastError` on the `Payout` table. All the data in the column will be lost.
  - You are about to drop the column `txHash` on the `Payout` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `Product` table. All the data in the column will be lost.
  - Made the column `orderId` on table `Payout` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `status` on the `Payout` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "public"."Payout" DROP CONSTRAINT "Payout_orderId_fkey";

-- DropIndex
DROP INDEX "public"."Payout_status_createdAt_idx";

-- AlterTable
ALTER TABLE "public"."Payout" DROP COLUMN "attempts",
DROP COLUMN "externalId",
DROP COLUMN "lastError",
DROP COLUMN "txHash",
ALTER COLUMN "orderId" SET NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."Product" DROP COLUMN "price",
ADD COLUMN     "walletId" TEXT,
ALTER COLUMN "currency" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Server" ALTER COLUMN "splitterAddress" DROP NOT NULL;

-- CreateTable
CREATE TABLE "public"."Wallet" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Wallet_serverId_idx" ON "public"."Wallet"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_serverId_currency_key" ON "public"."Wallet"("serverId", "currency");

-- CreateIndex
CREATE INDEX "Payout_serverId_idx" ON "public"."Payout"("serverId");

-- CreateIndex
CREATE INDEX "Server_guildId_idx" ON "public"."Server"("guildId");

-- AddForeignKey
ALTER TABLE "public"."Wallet" ADD CONSTRAINT "Wallet_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "public"."Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "public"."Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
