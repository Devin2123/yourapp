// scripts/role-worker.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;

async function addRole(guildId: string, userId: string, roleId: string) {
  const url = `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`;
  const res = await fetch(url, { method: "PUT", headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Discord role add failed: ${res.status} ${txt}`);
  }
}

async function processRoleGrants(batch = 25) {
  const grants = await prisma.roleGrant.findMany({
    where: { status: "QUEUED" },
    take: batch,
    orderBy: { createdAt: "asc" },
    include: { product: { include: { server: true } }, order: true },
  });

  for (const g of grants) {
    try {
      const guildId = g.product.server.guildId;
      const roleId  = g.product.roleId;
      const userId  = g.discordId;
      if (!roleId) throw new Error("Product has no roleId configured");

      await addRole(guildId, userId, roleId);
      await prisma.roleGrant.update({ where: { id: g.id }, data: { status: "DONE", attempts: { increment: 1 }, lastError: null } });
    } catch (e:any) {
      const attempts = g.attempts + 1;
      await prisma.roleGrant.update({
        where: { id: g.id },
        data: { status: attempts >= 5 ? "FAILED" : "QUEUED", attempts: { increment: 1 }, lastError: String(e?.message ?? e) },
      });
    }
  }
}

async function main() {
  console.log("Role worker started");
  setInterval(() => { processRoleGrants().catch(err => console.error("Worker error:", err)); }, 20_000);
}
main().catch(e => { console.error(e); process.exit(1); });
