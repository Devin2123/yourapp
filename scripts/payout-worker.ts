// scripts/payout-worker.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const API_URL = process.env.MAXELPAY_API_BASE!;
const API_KEY = process.env.MAXELPAY_API_KEY!;
const MOCK = process.env.MAXELPAY_MOCK === "true";

function log(...args: any[]) {
  console.log(new Date().toISOString(), ...args);
}

async function requestPayout(p: any) {
  if (MOCK) {
    // In mock mode we pretend provider accepted & confirmed immediately
    return { id: `mock_${p.id}`, tx_hash: `0xmock${p.id.slice(0, 8)}`, status: "confirmed" };
  }

  // --- Amount/chain helpers ---
  const DECIMALS: Record<string, number> = { USDC: 6, USDT: 6, USDCe: 6, NATIVE: 18, MATIC: 18, ETH: 18 };
  const toDecimal = (minor: string, asset: string) => {
    const d = DECIMALS[asset] ?? 18;
    const s = (minor || "").replace(/^0+/, "") || "0";
    if (s === "0") return "0";
    const pad = s.padStart(d + 1, "0");
    const head = pad.slice(0, -d);
    const tail = pad.slice(-d).replace(/0+$/, "");
    return tail ? `${head}.${tail}` : head;
  };
  const chainToNetwork = (c: string) => {
    const x = (c || "").toUpperCase();
    if (x === "POLYGON" || x === "MATIC") return "polygon";
    if (x === "ETHEREUM" || x === "ETH") return "ethereum";
    if (x === "BASE") return "base";
    return x.toLowerCase();
  };

  // --- Env-driven shape so you can iterate without code edits ---
  const FORMAT = (process.env.MAXELPAY_PAYOUT_FORMAT || "A").toUpperCase(); // A | B | C (C includes currency+asset)
  const DEST_KEY = process.env.MAXELPAY_PAYOUT_DEST_KEY || "destination_address"; // "destination_address" | "to_address" | "to" | "recipient"
  const NET_KEY  = process.env.MAXELPAY_PAYOUT_NETWORK_KEY || "network";         // "network" | "chain" | "chain_id"
  const AMT_KEY  = process.env.MAXELPAY_PAYOUT_AMOUNT_KEY || "amount";           // "amount" (decimal) | "amount_minor"
  const NUMERIC  = process.env.MAXELPAY_PAYOUT_NUMERIC === "true";               // send numbers instead of strings?

  const base: any = {
    amount: toDecimal(p.amountMinor, p.asset),   // decimal string
    amount_minor: p.amountMinor,                 // minor units string
    currency: p.asset,                           // symbol
    asset: p.asset,
    network: chainToNetwork(p.chain),
    chain: p.chain,
    chain_id: p.chain === "POLYGON" ? 137 : p.chain === "ETHEREUM" ? 1 : undefined,
    to: p.toAddress,
    to_address: p.toAddress,
    destination_address: p.toAddress,
    recipient: p.toAddress,
    idempotency_key: p.id,
    metadata: { payout_id: p.id, order_id: p.orderId, server_id: p.serverId },
  };

  const amountValue =
    AMT_KEY === "amount"
      ? (NUMERIC ? Number(base.amount) : String(base.amount))
      : (NUMERIC ? Number(base.amount_minor) : String(base.amount_minor));

  const payload: any = {
    idempotency_key: base.idempotency_key,
    metadata: base.metadata,
  };
  payload[AMT_KEY] = amountValue;
  payload[NET_KEY] = base[NET_KEY];
  payload[DEST_KEY] = base[DEST_KEY];

  if (FORMAT === "C") {
    payload.currency = base.currency;
    payload.asset = base.asset;
  }

  const res = await fetch(`${API_URL}/v1/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    const reason = `payout req failed: ${res.status} ${text.slice(0, 800)} :: sent=${JSON.stringify(payload).slice(0, 800)}`;
    throw new Error(reason);
  }
  try { return JSON.parse(text); } catch { return { status: "unknown" } }
}

async function pollPayout(externalId: string) {
  if (MOCK) return { status: "confirmed", tx_hash: `0xmock_${externalId}` };
  const res = await fetch(`${API_URL}/v1/payouts/${externalId}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`poll failed: ${res.status}`);
  return (await res.json()) as { status: string; tx_hash?: string };
}

async function processBatch(limit = 25) {
  const rows = await prisma.payout.findMany({
    where: { status: { in: ["QUEUED", "REQUESTED"] } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  if (!rows.length) {
    log("no payouts to process");
    return;
  }
  log(`processing ${rows.length} payout(s)…`);

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

        // In MOCK: mark CONFIRMED immediately. Otherwise: REQUESTED to start polling.
        await prisma.payout.update({
          where: { id: p.id },
          data: {
            status: MOCK ? "CONFIRMED" : "REQUESTED",
            externalId: data.id ?? null,
            txHash: data.tx_hash ?? null,
            attempts: { increment: 1 },
            lastError: null,
          },
        });

        if (MOCK) log(`✅ MOCK payout confirmed → ${p.toAddress} amountMinor=${p.amountMinor} ${p.asset}`);
        else log(`requested payout ${p.id} ext=${data.id ?? "?"}`);
      }

      if (!MOCK && p.status === "REQUESTED" && p.externalId) {
        const s = await pollPayout(p.externalId);
        if (s.status === "sent" || s.status === "broadcasted") {
          await prisma.payout.update({
            where: { id: p.id },
            data: { status: "SENT", txHash: s.tx_hash ?? p.txHash },
          });
          log(`payout ${p.id} sent`);
        } else if (s.status === "confirmed") {
          await prisma.payout.update({
            where: { id: p.id },
            data: { status: "CONFIRMED", txHash: s.tx_hash ?? p.txHash },
          });
          log(`✅ payout ${p.id} confirmed`);
        } else if (s.status === "failed") {
          throw new Error("provider marked payout failed");
        } else {
          log(`payout ${p.id} status=${s.status}`);
        }
      }
    } catch (e: any) {
      const attempts = p.attempts + 1;
      await prisma.payout.update({
        where: { id: p.id },
        data: {
          status: attempts >= 5 ? "FAILED" : p.status,
          attempts: { increment: 1 },
          lastError: String(e?.message ?? e),
        },
      });
      console.error("❌ payout error:", p.id, e?.message || e);
    }
  }
}

async function main() {
  log("Payout worker started (MOCK:", MOCK, ")");
  // run immediately so you see results, then every 5s
  await processBatch();
  setInterval(() => {
    processBatch().catch(err => console.error("payout tick error:", err));
  }, 5000);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
