/*
  Warnings:

  - You are about to drop the column `priceWei` on the `Product` table. All the data in the column will be lost.
  - Made the column `priceMinor` on table `Product` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."Product" DROP COLUMN "priceWei",
ADD COLUMN     "price" DECIMAL(10,2),
ALTER COLUMN "currency" SET DEFAULT 'USD',
ALTER COLUMN "priceMinor" SET NOT NULL;
