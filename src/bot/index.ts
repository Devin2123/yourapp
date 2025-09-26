// src/bot/index.ts
import type { Product } from "@prisma/client";
import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Interaction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
} from "discord.js";
import { z } from "zod";
import { prisma } from "../lib/db";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user?.tag}`);
});

/** ----- Utils ----- */

function assertGuildCommand(i: Interaction): asserts i is ChatInputCommandInteraction {
  if (!i.isChatInputCommand() || !i.guildId) {
    throw new Error("Guild context required.");
  }
}

function isAdminOrOwner(i: ChatInputCommandInteraction) {
  return (
    i.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    i.guild?.ownerId === i.user.id
  );
}

function formatUsdCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function mask(addr: string) {
  const s = addr.trim();
  if (s.length <= 10) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

/** price: allow price_cents or price_usd (legacy "price" also accepted) */
function parsePriceMinor(i: ChatInputCommandInteraction): number {
  const centsOpt = i.options.getInteger("price_cents");
  const usdStrOpt = i.options.getString("price_usd");
  const legacy = i.options.getString("price");

  if (centsOpt != null) {
    if (!Number.isFinite(centsOpt) || centsOpt <= 0) {
      throw new Error("Invalid price_cents. Example: 1499 for $14.99");
    }
    return centsOpt;
  }
  const dollarStr = usdStrOpt ?? legacy ?? "";
  if (dollarStr) {
    // Hard-block "wei-looking" huge ints
    if (/^\d{12,}$/.test(dollarStr)) {
      throw new Error("That looks like WEI. Use price_usd (e.g. 14.99) or price_cents (e.g. 1499).");
    }
    const v = Number(dollarStr);
    if (!Number.isFinite(v) || v <= 0) {
      throw new Error("Invalid price. Use price_usd like 14.99 or price_cents like 1499.");
    }
    return Math.round(v * 100);
  }
  throw new Error("Provide a price: either price_cents (int) or price_usd (e.g. 14.99).");
}

/** Chains & assets */
const EVM_CHAINS = ["ETHEREUM", "POLYGON", "BASE", "ARBITRUM", "OPTIMISM"] as const;
type EvmChain = typeof EVM_CHAINS[number];

const ASSETS_BY_CHAIN: Record<string, string[]> = {
  BITCOIN: ["BTC"],
  DOGECOIN: ["DOGE"],
  ETHEREUM: ["USDT", "ETH"],
  POLYGON: ["USDT", "ETH"],
  BASE: ["USDT", "ETH"],
  ARBITRUM: ["USDT", "ETH"],
  OPTIMISM: ["USDT", "ETH"],
};

const DEFAULT_ASSET: Record<string, string> = {
  BITCOIN: "BTC",
  DOGECOIN: "DOGE",
  ETHEREUM: "USDT",
  POLYGON: "USDT",
  BASE: "USDT",
  ARBITRUM: "USDT",
  OPTIMISM: "USDT",
};

function isEvmChain(chain: string): chain is EvmChain {
  return (EVM_CHAINS as readonly string[]).includes(chain);
}

function normalizeChain(v: string) {
  return v.trim().toUpperCase();
}
function normalizeAsset(v: string | null | undefined, chain: string) {
  const a = (v ?? DEFAULT_ASSET[chain] ?? "").trim().toUpperCase();
  const allowed = ASSETS_BY_CHAIN[chain] ?? [];
  if (!allowed.includes(a)) {
    throw new Error(`Asset ${a || "(empty)"} not supported on ${chain}. Allowed: ${allowed.join(", ")}`);
  }
  return a;
}

/** Simple address checks (basic guards) */
function isEvmAddress(addr: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}
function isBtcAddress(addr: string) {
  const s = addr.trim();
  return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(s);
}
function isDogeAddress(addr: string) {
  const s = addr.trim();
  return /^D[0-9A-Za-z]{25,50}$/.test(s);
}

function validateAddress(chain: string, addr: string) {
  if (chain === "BITCOIN") {
    if (!isBtcAddress(addr)) throw new Error("Invalid BTC address.");
    return addr.trim();
  }
  if (chain === "DOGECOIN") {
    if (!isDogeAddress(addr)) throw new Error("Invalid DOGE address.");
    return addr.trim();
  }
  if (isEvmChain(chain)) {
    if (!isEvmAddress(addr)) throw new Error("Invalid EVM address (must start with 0x and be 42 chars).");
    return addr.trim();
  }
  throw new Error(`Unsupported chain: ${chain}`);
}

/** Find a server “default” wallet = first one created */
async function getDefaultWallet(serverId: string) {
  return prisma.wallet.findFirst({
    where: { serverId },
    orderBy: { createdAt: "asc" },
  });
}

/** Ensure wallet belongs to this server */
async function getServerWalletOrThrow(serverId: string, walletId: string) {
  const w = await prisma.wallet.findFirst({ where: { id: walletId, serverId } });
  if (!w) throw new Error("Wallet not found for this server.");
  return w;
}

/** ----- Commands ----- */

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    // /wallet-add chain: STRING asset: STRING? address: STRING label?: STRING
    if (commandName === "wallet-add") {
      assertGuildCommand(interaction);
      if (!isAdminOrOwner(interaction)) {
        return interaction.reply({ content: "You need Administrator to run this.", ephemeral: true });
      }

      const chain = normalizeChain(interaction.options.getString("chain", true));
      const assetArg = interaction.options.getString("asset") ?? undefined;
      const address = interaction.options.getString("address", true).trim();
      const label = interaction.options.getString("label") ?? null;

      const server = await prisma.server.upsert({
        where: { guildId: interaction.guildId! },
        update: {},
        create: {
          guildId: interaction.guildId!,
          ownerDiscordId: interaction.guild?.ownerId ?? interaction.user.id,
        },
        select: { id: true },
      });

      const asset = normalizeAsset(assetArg, chain);
      const cleanAddr = validateAddress(chain, address);

      if (!ASSETS_BY_CHAIN[chain]) {
        return interaction.reply({
          content: `Unsupported chain. Allowed: ${Object.keys(ASSETS_BY_CHAIN).join(", ")}`,
          ephemeral: true,
        });
      }

      const w = await prisma.wallet.create({
        data: {
          serverId: server.id,
          label,
          chain,
          asset,
          address: cleanAddr,
        },
      });

      return interaction.reply({
        content: `✅ Wallet added: ${w.label ?? "(no label)"} · ${w.chain}/${w.asset} → \`${mask(w.address)}\`\n(When creating products, if you don’t pass wallet_id, I’ll use the first wallet added.)`,
        ephemeral: true,
      });
    }

    // /wallet-list
    if (commandName === "wallet-list") {
      assertGuildCommand(interaction);
      if (!isAdminOrOwner(interaction)) {
        return interaction.reply({ content: "You need Administrator to run this.", ephemeral: true });
      }

      const server = await prisma.server.findUnique({ where: { guildId: interaction.guildId! } });
      if (!server) return interaction.reply({ content: "No wallets yet.", ephemeral: true });

      const wallets = await prisma.wallet.findMany({
        where: { serverId: server.id },
        orderBy: { createdAt: "asc" },
      });

      if (wallets.length === 0) {
        return interaction.reply({ content: "No wallets configured. Use `/wallet-add`.", ephemeral: true });
      }

      const defaultHintId = wallets[0]?.id;
      const lines = wallets
        .map((w) => {
          const star = w.id === defaultHintId ? " ⭐ (first/used by default)" : "";
          return `• \`${w.id}\` — ${w.chain}/${w.asset}${star}\n  ${w.label ?? "(no label)"} → ${mask(w.address)}`;
        })
        .join("\n");

      return interaction.reply({ content: lines, ephemeral: true });
    }

    // /wallet-default wallet_id: STRING  (not supported in quick-fix)
    if (commandName === "wallet-default") {
      assertGuildCommand(interaction);
      if (!isAdminOrOwner(interaction)) {
        return interaction.reply({ content: "You need Administrator to run this.", ephemeral: true });
      }
      return interaction.reply({
        content:
          "This build doesn’t support setting a default wallet. I’ll use the first wallet created unless you pass `wallet_id` when creating a product.",
        ephemeral: true,
      });
    }

    // /pay-set (back-compat): behaves like wallet-add with chain’s default asset
    if (commandName === "pay-set") {
      assertGuildCommand(interaction);
      if (!isAdminOrOwner(interaction)) {
        return interaction.reply({ content: "You need Administrator to run this.", ephemeral: true });
      }

      const chain = normalizeChain(interaction.options.getString("chain", true));
      const address = interaction.options.getString("address", true).trim();

      const server = await prisma.server.upsert({
        where: { guildId: interaction.guildId! },
        update: {},
        create: {
          guildId: interaction.guildId!,
          ownerDiscordId: interaction.guild?.ownerId ?? interaction.user.id,
        },
        select: { id: true },
      });

      const asset = normalizeAsset(undefined, chain); // default by chain
      const cleanAddr = validateAddress(chain, address);

      const w = await prisma.wallet.create({
        data: { serverId: server.id, chain, asset, address: cleanAddr, label: `Default ${chain}` },
      });

      return interaction.reply({
        content: `✅ Payout wallet saved: ${w.chain}/${w.asset} → ${mask(w.address)}\n(If you don’t specify wallet_id when creating products, I’ll use the first wallet.)`,
        ephemeral: true,
      });
    }

    // /product-create name: STRING price_usd?: STRING price_cents?: INT role?: ROLE wallet_id?: STRING
    if (commandName === "product-create") {
      assertGuildCommand(interaction);
      if (!isAdminOrOwner(interaction)) {
        return interaction.reply({ content: "You need Administrator to run this.", ephemeral: true });
      }

      const name = interaction.options.getString("name", true);
      const role = interaction.options.getRole("role");
      const walletId = interaction.options.getString("wallet_id") ?? null;

      const server = await prisma.server.findUnique({ where: { guildId: interaction.guildId! } });
      if (!server) return interaction.reply({ content: "⚠️ Server not configured. Add a wallet first.", ephemeral: true });

      const priceMinor = parsePriceMinor(interaction);

      // pick wallet: provided → that wallet; otherwise first wallet for server
      let wallet = walletId
        ? await getServerWalletOrThrow(server.id, walletId)
        : await getDefaultWallet(server.id);

      if (!wallet) {
        return interaction.reply({ content: "No wallet set. Use `/wallet-add` first.", ephemeral: true });
      }

      const product = await prisma.product.create({
        data: {
          name,
          description: null,
          serverId: server.id,
          priceMinor,
          currency: wallet.asset, // what you intend to payout in
          chain: wallet.chain,
          roleId: role?.id ?? null,
          active: true,
          walletId: wallet.id, // bind wallet to the product
        },
      });

      const embed = new EmbedBuilder()
        .setTitle("Product created")
        .addFields(
          { name: "ID", value: product.id },
          { name: "Name", value: product.name, inline: true },
          { name: "Price", value: formatUsdCents(product.priceMinor), inline: true },
          { name: "Payout", value: `${wallet.chain}/${wallet.asset} → ${mask(wallet.address)}`, inline: false },
          { name: "Role", value: product.roleId ? `<@&${product.roleId}>` : "—", inline: true },
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // /product-set-role product_id: STRING role: ROLE
    if (commandName === "product-set-role") {
      assertGuildCommand(interaction);
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({ content: "You need Manage Roles permission.", ephemeral: true });
      }
      const productId = interaction.options.getString("product_id", true);
      const role = interaction.options.getRole("role", true);

      const me = await interaction.guild!.members.fetchMe();
      const targetRole = await interaction.guild!.roles.fetch(role.id);
      if (!targetRole || me.roles.highest.comparePositionTo(targetRole) <= 0) {
        return interaction.reply({ content: "❌ I can’t manage that role. Move my bot role above the target role.", ephemeral: true });
      }

      const product = await prisma.product.update({ where: { id: productId }, data: { roleId: role.id } });
      return interaction.reply({ content: `✅ Role <@&${role.id}> linked to product **${product.name}** (${product.id})`, ephemeral: true });
    }

    // /product-set-price product_id: STRING price_usd?: STRING price_cents?: INT
    if (commandName === "product-set-price") {
      assertGuildCommand(interaction);
      if (!isAdminOrOwner(interaction)) {
        return interaction.reply({ content: "You need Administrator to run this.", ephemeral: true });
      }
      const productId = interaction.options.getString("product_id", true);

      let priceMinor: number;
      try {
        priceMinor = parsePriceMinor(interaction);
      } catch (e) {
        return interaction.reply({ content: (e as Error).message, ephemeral: true });
      }

      const product = await prisma.product.update({ where: { id: productId }, data: { priceMinor } });
      return interaction.reply({ content: `✅ Updated **${product.name}** – price: ${formatUsdCents(product.priceMinor)}`, ephemeral: true });
    }

    // /product-list
    if (commandName === "product-list") {
      assertGuildCommand(interaction);
      if (!isAdminOrOwner(interaction)) {
        return interaction.reply({ content: "You need Administrator to run this.", ephemeral: true });
      }

      const server = await prisma.server.findUnique({ where: { guildId: interaction.guildId! } });
      if (!server) return interaction.reply({ content: "⚠️ Server not configured.", ephemeral: true });

      const products = await prisma.product.findMany({
        where: { serverId: server.id, active: true },
        include: { wallet: true },
        orderBy: { createdAt: "desc" },
      });
      if (products.length === 0) return interaction.reply({ content: "No active products yet.", ephemeral: true });

      const lines = products
        .map((p) => {
          const w = p.wallet;
          const payout = w ? `${w.chain}/${w.asset} → ${mask(w.address)}` : `${p.chain}/${p.currency}`;
          return `• **${p.name}** \`(${p.id})\` – ${formatUsdCents(p.priceMinor)} · payout: ${payout}${
            p.roleId ? ` · role <@&${p.roleId}>` : ""
          }`;
        })
        .join("\n");

      return interaction.reply({ content: lines, ephemeral: true });
    }

    // /product-delete product_id: STRING
    if (commandName === "product-delete") {
      assertGuildCommand(interaction);
      if (!isAdminOrOwner(interaction)) {
        return interaction.reply({ content: "You need Administrator to run this.", ephemeral: true });
      }
      const productId = interaction.options.getString("product_id", true);

      await prisma.product.update({ where: { id: productId }, data: { active: false } });
      return interaction.reply({ content: `🗑️ Product \`${productId}\` set inactive.`, ephemeral: true });
    }

    // /buy-post product_id: STRING
    if (commandName === "buy-post") {
      assertGuildCommand(interaction);
      const productId = interaction.options.getString("product_id", true);

      const server = await prisma.server.findUnique({ where: { guildId: interaction.guildId! } });
      if (!server) return interaction.reply({ content: "⚠️ Server not configured.", ephemeral: true });

      const product = await prisma.product.findFirst({
        where: { id: productId, serverId: server.id, active: true },
        include: { wallet: true },
      });
      if (!product) return interaction.reply({ content: "Product not found for this server.", ephemeral: true });

      const buyUrl = `${APP_URL}/products/${product.id}?buyer=${interaction.user.id}`;
      const btn = new ButtonBuilder().setLabel(`Buy ${product.name}`).setStyle(ButtonStyle.Link).setURL(buyUrl);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);

      const w = product.wallet;
      const payout = w ? `${w.chain}/${w.asset} → ${mask(w.address)}` : `${product.chain}/${product.currency}`;

      return interaction.reply({
        content: `Purchase **${product.name}** – ${formatUsdCents(product.priceMinor)} · payout: ${payout}`,
        components: [row],
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[Bot Error]", err);
    if (interaction.isRepliable()) {
      // keep user-friendly, hide stack details
      interaction.reply({ content: `❌ Error: ${msg}`, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
