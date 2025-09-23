-- CreateTable
CREATE TABLE "public"."Server" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "ownerDiscordId" TEXT NOT NULL,
    "payoutWallet" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT 'POLYGON',
    "splitterAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Product" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceWei" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT 'POLYGON',
    "roleId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Order" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "buyerDiscordId" TEXT,
    "invoiceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "grossWei" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Server_guildId_key" ON "public"."Server"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_invoiceId_key" ON "public"."Order"("invoiceId");

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "public"."Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
