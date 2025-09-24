"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// scripts/payout-worker.ts
require("dotenv/config");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const API_URL = process.env.MAXELPAY_API_BASE;
const API_KEY = process.env.MAXELPAY_API_KEY;
async function requestPayout(p) {
    // TODO: swap field names to MaxelPay's real payout API schema
    const body = {
        amount_minor: p.amountMinor,
        asset: p.asset, // "USDC" | "NATIVE"
        chain: p.chain, // "POLYGON"
        to: p.toAddress, // seller address
        idempotency_key: p.id,
        metadata: { orderId: p.orderId, serverId: p.serverId },
    };
    const res = await fetch(`${API_URL}/v1/payouts`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`payout req failed: ${res.status} ${txt}`);
    }
    return (await res.json());
}
async function pollPayout(externalId) {
    const res = await fetch(`${API_URL}/v1/payouts/${externalId}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!res.ok)
        throw new Error(`poll failed: ${res.status}`);
    return (await res.json());
}
async function processBatch(limit = 25) {
    var _a, _b, _c, _d, _e;
    const rows = await prisma.payout.findMany({
        where: { status: { in: ["QUEUED", "REQUESTED"] } },
        orderBy: { createdAt: "asc" },
        take: limit,
    });
    for (const p of rows) {
        try {
            if (p.status === "QUEUED") {
                const data = await requestPayout({
                    id: p.id,
                    amountMinor: p.amountMinor,
                    asset: p.asset,
                    chain: p.chain,
                    toAddress: p.toAddress,
                    orderId: p.orderId,
                    serverId: p.serverId,
                });
                await prisma.payout.update({
                    where: { id: p.id },
                    data: {
                        status: "REQUESTED",
                        externalId: (_a = data.id) !== null && _a !== void 0 ? _a : null,
                        txHash: (_b = data.tx_hash) !== null && _b !== void 0 ? _b : null,
                        attempts: { increment: 1 },
                        lastError: null,
                    },
                });
            }
            else if (p.status === "REQUESTED" && p.externalId) {
                const s = await pollPayout(p.externalId);
                if (s.status === "sent" || s.status === "broadcasted") {
                    await prisma.payout.update({
                        where: { id: p.id },
                        data: { status: "SENT", txHash: (_c = s.tx_hash) !== null && _c !== void 0 ? _c : p.txHash },
                    });
                }
                else if (s.status === "confirmed") {
                    await prisma.payout.update({
                        where: { id: p.id },
                        data: { status: "CONFIRMED", txHash: (_d = s.tx_hash) !== null && _d !== void 0 ? _d : p.txHash },
                    });
                }
                else if (s.status === "failed") {
                    throw new Error("provider marked payout failed");
                }
            }
        }
        catch (e) {
            const attempts = p.attempts + 1;
            await prisma.payout.update({
                where: { id: p.id },
                data: {
                    status: attempts >= 5 ? "FAILED" : p.status,
                    attempts: { increment: 1 },
                    lastError: String((_e = e === null || e === void 0 ? void 0 : e.message) !== null && _e !== void 0 ? _e : e),
                },
            });
            console.error("payout error:", p.id, (e === null || e === void 0 ? void 0 : e.message) || e);
        }
    }
}
async function main() {
    console.log("Payout worker started");
    setInterval(() => {
        processBatch().catch(err => console.error("payout tick error:", err));
    }, 20000);
}
main().catch(e => {
    console.error(e);
    process.exit(1);
});
