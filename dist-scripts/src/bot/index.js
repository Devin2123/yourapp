"use strict";
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const discord_js_1 = require("discord.js");
const db_1 = require("../lib/db");
// ---------- Config ----------
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const QUIET_LOGS = (process.env.QUIET_LOGS || "").toLowerCase() === "true";
// Chains & assets we support
const EVM_CHAINS = ["ETHEREUM", "POLYGON", "BASE", "ARBITRUM", "OPTIMISM"];
const NON_EVM_CHAINS = ["BITCOIN", "DOGECOIN"];
// For each chain group, which assets are allowed (we store asset in Product.currency)
const ASSETS_BY_CHAIN = {
    EVM: ["USDT", "ETH"],
    ETHEREUM: ["USDT", "ETH"],
    POLYGON: ["USDT", "ETH"],
    BASE: ["USDT", "ETH"],
    ARBITRUM: ["USDT", "ETH"],
    OPTIMISM: ["USDT", "ETH"],
    BITCOIN: ["BTC"],
    DOGECOIN: ["DOGE"],
};
// Default asset per chain if seller doesn’t supply one
const DEFAULT_ASSET_BY_CHAIN = {
    EVM: "USDT",
    ETHEREUM: "USDT",
    POLYGON: "USDT",
    BASE: "USDT",
    ARBITRUM: "USDT",
    OPTIMISM: "USDT",
    BITCOIN: "BTC",
    DOGECOIN: "DOGE",
};
const EPHEMERAL = (_a = discord_js_1.MessageFlags === null || discord_js_1.MessageFlags === void 0 ? void 0 : discord_js_1.MessageFlags.Ephemeral) !== null && _a !== void 0 ? _a : 64;
// ---------- Light error handling ----------
class UserError extends Error {
}
function logUnexpected(err, tag = "bot") {
    if (QUIET_LOGS) {
        console.warn(`[${tag}] Sent Error (suppressed).`);
    }
    else {
        console.error(err);
    }
}
// ---------- Client ----------
const client = new discord_js_1.Client({ intents: [discord_js_1.GatewayIntentBits.Guilds] });
let started = false;
const onReady = () => {
    var _a;
    if (started)
        return;
    started = true;
    console.log(`🤖 Logged in as ${(_a = client.user) === null || _a === void 0 ? void 0 : _a.tag}`);
};
// Prefer new event name if present; keep fallback
(_c = (_b = client).once) === null || _c === void 0 ? void 0 : _c.call(_b, "clientReady", onReady);
client.once("ready", onReady);
// ---------- Helpers ----------
function assertGuildCommand(i) {
    if (!i.isChatInputCommand() || !i.guildId) {
        throw new UserError("Guild context required.");
    }
}
function isAdminOrOwner(i) {
    var _a, _b;
    return (((_a = i.memberPermissions) === null || _a === void 0 ? void 0 : _a.has(discord_js_1.PermissionFlagsBits.Administrator)) ||
        ((_b = i.guild) === null || _b === void 0 ? void 0 : _b.ownerId) === i.user.id);
}
const formatUsdCents = (cents) => `$${(Number(cents) / 100).toFixed(2)}`;
function isEvmAddress(addr) {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
}
function isBitcoinAddress(addr) {
    // P2PKH / P2SH
    if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr))
        return true;
    // bech32 mainnet (bc1...)
    if (/^bc1[0-9ac-hj-np-z]{25,62}$/.test(addr))
        return true;
    return false;
}
function isDogecoinAddress(addr) {
    // Legacy Base58 often starts with D..., lengths ~26-35
    if (/^D[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(addr))
        return true;
    // bech32 doge1...
    if (/^doge1[0-9ac-hj-np-z]{20,60}$/.test(addr))
        return true;
    return false;
}
function normalizeChain(input) {
    const c = input.toUpperCase();
    const allowed = [...EVM_CHAINS, ...NON_EVM_CHAINS];
    if (!allowed.includes(c)) {
        throw new UserError(`Unsupported chain. Allowed: ${allowed.join(", ")}.`);
    }
    return c;
}
function validatePayoutAddress(chain, address) {
    if ([...EVM_CHAINS].includes(chain)) {
        if (!isEvmAddress(address)) {
            throw new UserError("Invalid EVM address. Expected a 0x-prefixed 42-char address.");
        }
        return;
    }
    if (chain === "BITCOIN") {
        if (!isBitcoinAddress(address)) {
            throw new UserError("Invalid BTC address. Expect 1/3... Base58 or bc1... bech32.");
        }
        return;
    }
    if (chain === "DOGECOIN") {
        if (!isDogecoinAddress(address)) {
            throw new UserError("Invalid DOGE address. Expect D... Base58 or doge1... bech32.");
        }
        return;
    }
}
function normalizeAssetForChain(assetInput, chain) {
    const asset = (assetInput || DEFAULT_ASSET_BY_CHAIN[([...EVM_CHAINS].includes(chain) ? "EVM" : chain)]).toUpperCase();
    const allowed = ASSETS_BY_CHAIN[([...EVM_CHAINS].includes(chain) ? "EVM" : chain)];
    if (!allowed.includes(asset)) {
        throw new UserError(`Asset ${asset} not supported on ${chain}. Allowed: ${allowed.join(", ")}.`);
    }
    return asset;
}
/**
 * Parse price into USD cents.
 * Accepts price_cents (int 1499) OR price_usd (string "14.99") OR legacy price (string).
 * Rejects wei-looking integers (>=10 digits all numeric).
 */
function parsePriceMinor(i) {
    var _a;
    const centsOpt = i.options.getInteger("price_cents");
    const usdStrOpt = i.options.getString("price_usd");
    const legacy = i.options.getString("price");
    if (centsOpt != null) {
        if (!Number.isFinite(centsOpt) || centsOpt <= 0) {
            throw new UserError("Invalid price_cents. Example: 1499 for $14.99.");
        }
        if (centsOpt > 2000000000)
            throw new UserError("price_cents too large.");
        return centsOpt;
    }
    const s = ((_a = usdStrOpt !== null && usdStrOpt !== void 0 ? usdStrOpt : legacy) !== null && _a !== void 0 ? _a : "").trim();
    if (!s)
        throw new UserError("Provide a price: price_cents (e.g. 1499) or price_usd (e.g. 14.99).");
    if (/^\d{10,}$/.test(s)) {
        throw new UserError("That looks like WEI. Use price_usd (e.g. 14.99) or price_cents (e.g. 1499).");
    }
    const v = Number(s);
    if (!Number.isFinite(v) || v <= 0) {
        throw new UserError("Invalid price. Use price_usd like 14.99 or price_cents like 1499.");
    }
    const cents = Math.round(v * 100);
    if (cents > 2000000000)
        throw new UserError("Price is too large.");
    return cents;
}
// ---------- Interactions ----------
client.on("interactionCreate", async (interaction) => {
    var _a, _b, _c, _d;
    try {
        if (!interaction.isChatInputCommand())
            return;
        const { commandName } = interaction;
        // /pay-set — set payout chain & wallet (supports EVM, BITCOIN, DOGECOIN)
        if (commandName === "pay-set") {
            assertGuildCommand(interaction);
            if (!isAdminOrOwner(interaction)) {
                return interaction.reply({ content: "You need Administrator to run this.", flags: EPHEMERAL });
            }
            const chainRaw = interaction.options.getString("chain", true);
            const address = interaction.options.getString("address", true);
            const chain = normalizeChain(chainRaw);
            validatePayoutAddress(chain, address);
            const server = await db_1.prisma.server.upsert({
                where: { guildId: interaction.guildId },
                update: { chain, payoutWallet: address },
                create: {
                    guildId: interaction.guildId,
                    ownerDiscordId: (_b = (_a = interaction.guild) === null || _a === void 0 ? void 0 : _a.ownerId) !== null && _b !== void 0 ? _b : interaction.user.id,
                    payoutWallet: address,
                    chain,
                    splitterAddress: "",
                },
            });
            return interaction.reply({
                content: `✅ Payout set.\n• Chain: **${server.chain}**\n• Address: **${server.payoutWallet}**`,
                flags: EPHEMERAL,
            });
        }
        // /product-create — enforce asset compatibility with server chain
        if (commandName === "product-create") {
            assertGuildCommand(interaction);
            if (!isAdminOrOwner(interaction)) {
                return interaction.reply({ content: "You need Administrator to run this.", flags: EPHEMERAL });
            }
            const name = interaction.options.getString("name", true);
            const rawAsset = interaction.options.getString("currency"); // we keep using "currency" option name
            const role = interaction.options.getRole("role");
            const server = await db_1.prisma.server.findUnique({ where: { guildId: interaction.guildId } });
            if (!server) {
                return interaction.reply({ content: "⚠️ Server not configured. Run `/pay-set` first.", flags: EPHEMERAL });
            }
            const chain = normalizeChain(server.chain);
            const asset = normalizeAssetForChain(rawAsset, chain);
            const priceMinor = parsePriceMinor(interaction);
            const product = await db_1.prisma.product.create({
                data: {
                    name,
                    description: null,
                    serverId: server.id,
                    currency: asset, // <— payout asset (BTC/ETH/USDT/DOGE)
                    chain, // <— payout chain
                    roleId: (_c = role === null || role === void 0 ? void 0 : role.id) !== null && _c !== void 0 ? _c : null,
                    active: true,
                    priceMinor, // USD cents for invoice
                },
            });
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle("Product created")
                .addFields({ name: "ID", value: product.id }, { name: "Name", value: product.name, inline: true }, { name: "Payout", value: `${product.currency} on ${product.chain}`, inline: true }, { name: "Price (Invoice)", value: formatUsdCents(product.priceMinor), inline: true }, { name: "Role", value: product.roleId ? `<@&${product.roleId}>` : "—", inline: true });
            return interaction.reply({ embeds: [embed], flags: EPHEMERAL });
        }
        // /product-set-role
        if (commandName === "product-set-role") {
            assertGuildCommand(interaction);
            if (!((_d = interaction.memberPermissions) === null || _d === void 0 ? void 0 : _d.has(discord_js_1.PermissionFlagsBits.ManageRoles))) {
                return interaction.reply({ content: "You need Manage Roles permission.", flags: EPHEMERAL });
            }
            const productId = interaction.options.getString("product_id", true);
            const role = interaction.options.getRole("role", true);
            const me = await interaction.guild.members.fetchMe();
            const targetRole = await interaction.guild.roles.fetch(role.id);
            if (!targetRole || me.roles.highest.comparePositionTo(targetRole) <= 0) {
                return interaction.reply({
                    content: "❌ I can’t manage that role. Move my bot role above the target role.",
                    flags: EPHEMERAL,
                });
            }
            const product = await db_1.prisma.product.update({
                where: { id: productId },
                data: { roleId: role.id },
            });
            return interaction.reply({
                content: `✅ Role <@&${role.id}> linked to product **${product.name}** (${product.id})`,
                flags: EPHEMERAL,
            });
        }
        // /product-set-price — can also switch payout asset (validated vs chain)
        if (commandName === "product-set-price") {
            assertGuildCommand(interaction);
            if (!isAdminOrOwner(interaction)) {
                return interaction.reply({ content: "You need Administrator to run this.", flags: EPHEMERAL });
            }
            const productId = interaction.options.getString("product_id", true);
            const assetInput = interaction.options.getString("currency"); // optional
            const product = await db_1.prisma.product.findUnique({ where: { id: productId } });
            if (!product)
                return interaction.reply({ content: "Product not found.", flags: EPHEMERAL });
            const chain = normalizeChain(product.chain);
            const asset = assetInput ? normalizeAssetForChain(assetInput, chain) : undefined;
            const hasAnyPriceInput = interaction.options.getInteger("price_cents") != null ||
                !!interaction.options.getString("price_usd") ||
                !!interaction.options.getString("price");
            if (!hasAnyPriceInput && !asset) {
                return interaction.reply({
                    content: "Provide a price (price_usd or price_cents) and/or a payout asset.",
                    flags: EPHEMERAL,
                });
            }
            const data = {};
            if (asset)
                data.currency = asset;
            if (hasAnyPriceInput)
                data.priceMinor = parsePriceMinor(interaction);
            const updated = await db_1.prisma.product.update({
                where: { id: productId },
                data,
            });
            return interaction.reply({
                content: `✅ Updated **${updated.name}** – payout: ${updated.currency} on ${updated.chain} · price: ${formatUsdCents(updated.priceMinor)}`,
                flags: EPHEMERAL,
            });
        }
        // /product-list
        if (commandName === "product-list") {
            assertGuildCommand(interaction);
            if (!isAdminOrOwner(interaction)) {
                return interaction.reply({ content: "You need Administrator to run this.", flags: EPHEMERAL });
            }
            const server = await db_1.prisma.server.findUnique({ where: { guildId: interaction.guildId } });
            if (!server) {
                return interaction.reply({ content: "⚠️ Server not configured. Run `/pay-set` first.", flags: EPHEMERAL });
            }
            const products = await db_1.prisma.product.findMany({
                where: { serverId: server.id, active: true },
                orderBy: { createdAt: "desc" },
            });
            if (products.length === 0) {
                return interaction.reply({ content: "No active products yet.", flags: EPHEMERAL });
            }
            const lines = products
                .map((p) => `• **${p.name}** \`(${p.id})\` – payout: ${p.currency} on ${p.chain} · invoice: ${formatUsdCents(p.priceMinor)}${p.roleId ? ` · role <@&${p.roleId}>` : ""}`)
                .join("\n");
            return interaction.reply({ content: lines, flags: EPHEMERAL });
        }
        // /product-delete
        if (commandName === "product-delete") {
            assertGuildCommand(interaction);
            if (!isAdminOrOwner(interaction)) {
                return interaction.reply({ content: "You need Administrator to run this.", flags: EPHEMERAL });
            }
            const productId = interaction.options.getString("product_id", true);
            await db_1.prisma.product.update({ where: { id: productId }, data: { active: false } });
            return interaction.reply({ content: `🗑️ Product \`${productId}\` set inactive.`, flags: EPHEMERAL });
        }
        // /buy-post
        if (commandName === "buy-post") {
            assertGuildCommand(interaction);
            const productId = interaction.options.getString("product_id", true);
            const server = await db_1.prisma.server.findUnique({ where: { guildId: interaction.guildId } });
            if (!server) {
                return interaction.reply({ content: "⚠️ Server not configured. Run `/pay-set` first.", flags: EPHEMERAL });
            }
            const product = await db_1.prisma.product.findFirst({
                where: { id: productId, serverId: server.id, active: true },
            });
            if (!product) {
                return interaction.reply({ content: "Product not found for this server.", flags: EPHEMERAL });
            }
            const buyUrl = `${APP_URL}/products/${product.id}?buyer=${interaction.user.id}`;
            const btn = new discord_js_1.ButtonBuilder().setLabel(`Buy ${product.name}`).setStyle(discord_js_1.ButtonStyle.Link).setURL(buyUrl);
            const row = new discord_js_1.ActionRowBuilder().addComponents(btn);
            return interaction.reply({
                content: `Purchase **${product.name}** – payout: ${product.currency} on ${product.chain} · invoice: ${formatUsdCents(product.priceMinor)}`,
                components: [row],
            });
        }
    }
    catch (err) {
        if (err instanceof UserError) {
            if (interaction.isRepliable()) {
                interaction.reply({ content: `❌ ${err.message}`, flags: EPHEMERAL }).catch(() => { });
            }
            return;
        }
        logUnexpected(err, "interaction");
        if (interaction.isRepliable()) {
            interaction.reply({ content: "⚠️ Something went wrong. Please try again.", flags: EPHEMERAL }).catch(() => { });
        }
    }
});
client.login(process.env.DISCORD_BOT_TOKEN);
