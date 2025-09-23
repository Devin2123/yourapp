"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const discord_js_1 = require("discord.js");
const zod_1 = require("zod");
const db_1 = require("../lib/db");
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const client = new discord_js_1.Client({ intents: [discord_js_1.GatewayIntentBits.Guilds] });
client.once("ready", () => {
    var _a;
    console.log(`🤖 Logged in as ${(_a = client.user) === null || _a === void 0 ? void 0 : _a.tag}`);
});
// Helpers
function requireGuild(interaction) {
    if (!interaction.isChatInputCommand() || !interaction.guildId) {
        throw new Error("Guild context required.");
    }
}
function isAdminOrOwner(interaction) {
    var _a, _b;
    return ((_a = interaction.memberPermissions) === null || _a === void 0 ? void 0 : _a.has(discord_js_1.PermissionFlagsBits.Administrator)) || ((_b = interaction.guild) === null || _b === void 0 ? void 0 : _b.ownerId) === interaction.user.id;
}
client.on("interactionCreate", async (interaction) => {
    var _a, _b, _c, _d, _e;
    try {
        if (!interaction.isChatInputCommand())
            return;
        const { commandName } = interaction;
        // -----------------------
        // /pay-set
        // -----------------------
        if (commandName === "pay-set") {
            requireGuild(interaction);
            if (!isAdminOrOwner(interaction)) {
                return interaction.reply({ content: "You need Administrator to run this.", ephemeral: true });
            }
            const ChainBody = zod_1.z.object({
                chain: zod_1.z.string().min(2),
                address: zod_1.z.string().min(4),
            });
            const parsed = ChainBody.parse({
                chain: interaction.options.getString("chain", true).toUpperCase(),
                address: interaction.options.getString("address", true),
            });
            const server = await db_1.prisma.server.upsert({
                where: { guildId: interaction.guildId },
                update: { chain: parsed.chain, payoutWallet: parsed.address },
                create: {
                    guildId: interaction.guildId,
                    ownerDiscordId: (_b = (_a = interaction.guild) === null || _a === void 0 ? void 0 : _a.ownerId) !== null && _b !== void 0 ? _b : interaction.user.id,
                    payoutWallet: parsed.address,
                    chain: parsed.chain,
                    splitterAddress: "", // optional if you use splitters later
                },
            });
            return interaction.reply({ content: `✅ Payout set.\n• Chain: **${server.chain}**\n• Address: **${server.payoutWallet}**`, ephemeral: true });
        }
        // -----------------------
        // /product-create
        // -----------------------
        if (commandName === "product-create") {
            requireGuild(interaction);
            if (!isAdminOrOwner(interaction)) {
                return interaction.reply({ content: "You need Administrator to run this.", ephemeral: true });
            }
            const name = interaction.options.getString("name", true);
            const currency = interaction.options.getString("currency", true);
            const price = interaction.options.getString("price", true);
            const role = interaction.options.getRole("role");
            const server = await db_1.prisma.server.findUnique({ where: { guildId: interaction.guildId } });
            if (!server) {
                return interaction.reply({ content: "⚠️ Server not configured. Run `/pay-set` first.", ephemeral: true });
            }
            const product = await db_1.prisma.product.create({
                data: {
                    name,
                    description: null,
                    serverId: server.id,
                    currency,
                    priceWei: price,
                    chain: server.chain,
                    roleId: (_c = role === null || role === void 0 ? void 0 : role.id) !== null && _c !== void 0 ? _c : null,
                    active: true,
                },
            });
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle("Product created")
                .addFields({ name: "ID", value: product.id }, { name: "Name", value: product.name, inline: true }, { name: "Currency", value: product.currency, inline: true }, { name: "Price (wei)", value: product.priceWei, inline: true }, { name: "Role", value: product.roleId ? `<@&${product.roleId}>` : "—", inline: true });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        // -----------------------
        // /product-set-role
        // -----------------------
        if (commandName === "product-set-role") {
            requireGuild(interaction);
            if (!((_d = interaction.memberPermissions) === null || _d === void 0 ? void 0 : _d.has(discord_js_1.PermissionFlagsBits.ManageRoles))) {
                return interaction.reply({ content: "You need Manage Roles permission.", ephemeral: true });
            }
            const productId = interaction.options.getString("product_id", true);
            const role = interaction.options.getRole("role", true);
            // Role hierarchy safety: bot must be able to manage the role
            const me = await interaction.guild.members.fetchMe();
            const targetRole = await interaction.guild.roles.fetch(role.id);
            if (!targetRole || me.roles.highest.comparePositionTo(targetRole) <= 0) {
                return interaction.reply({ content: "❌ I can’t manage that role. Move my bot role above the target role.", ephemeral: true });
            }
            const product = await db_1.prisma.product.update({
                where: { id: productId },
                data: { roleId: role.id },
            });
            return interaction.reply({ content: `✅ Role <@&${role.id}> linked to product **${product.name}** (${product.id})`, ephemeral: true });
        }
        // -----------------------
        // /product-set-price
        // -----------------------
        if (commandName === "product-set-price") {
            requireGuild(interaction);
            if (!isAdminOrOwner(interaction)) {
                return interaction.reply({ content: "You need Administrator to run this.", ephemeral: true });
            }
            const productId = interaction.options.getString("product_id", true);
            const price = interaction.options.getString("price", true);
            const currency = interaction.options.getString("currency", true);
            const product = await db_1.prisma.product.update({
                where: { id: productId },
                data: { priceWei: price, currency },
            });
            return interaction.reply({
                content: `✅ Updated **${product.name}** – price(wei): \`${product.priceWei}\`, currency: \`${product.currency}\``,
                ephemeral: true,
            });
        }
        // -----------------------
        // /product-list
        // -----------------------
        if (commandName === "product-list") {
            requireGuild(interaction);
            if (!isAdminOrOwner(interaction)) {
                return interaction.reply({ content: "You need Administrator to run this.", ephemeral: true });
            }
            const server = await db_1.prisma.server.findUnique({ where: { guildId: interaction.guildId } });
            if (!server)
                return interaction.reply({ content: "⚠️ Server not configured. Run `/pay-set` first.", ephemeral: true });
            const products = await db_1.prisma.product.findMany({ where: { serverId: server.id, active: true }, orderBy: { createdAt: "desc" } });
            if (products.length === 0)
                return interaction.reply({ content: "No active products yet.", ephemeral: true });
            const lines = products.map((p) => `• **${p.name}** \`(${p.id})\` – ${p.currency} @ wei=${p.priceWei}${p.roleId ? ` – role <@&${p.roleId}>` : ""}`).join("\n");
            return interaction.reply({ content: lines, ephemeral: true });
        }
        // -----------------------
        // /product-delete
        // -----------------------
        if (commandName === "product-delete") {
            requireGuild(interaction);
            if (!isAdminOrOwner(interaction)) {
                return interaction.reply({ content: "You need Administrator to run this.", ephemeral: true });
            }
            const productId = interaction.options.getString("product_id", true);
            await db_1.prisma.product.update({ where: { id: productId }, data: { active: false } });
            return interaction.reply({ content: `🗑️ Product \`${productId}\` set inactive.`, ephemeral: true });
        }
        // -----------------------
        // /buy-post
        // -----------------------
        if (commandName === "buy-post") {
            requireGuild(interaction);
            const productId = interaction.options.getString("product_id", true);
            // Optional: validate product belongs to this guild & is active
            const server = await db_1.prisma.server.findUnique({ where: { guildId: interaction.guildId } });
            if (!server)
                return interaction.reply({ content: "⚠️ Server not configured. Run `/pay-set` first.", ephemeral: true });
            const product = await db_1.prisma.product.findFirst({
                where: { id: productId, serverId: server.id, active: true },
            });
            if (!product)
                return interaction.reply({ content: "Product not found for this server.", ephemeral: true });
            // Build a purchase link that your frontend understands.
            // Your product page should call your /api/invoices POST with { productId, buyerDiscordId }.
            const buyUrl = `${APP_URL}/products/${product.id}?buyer=${interaction.user.id}`;
            const btn = new discord_js_1.ButtonBuilder()
                .setLabel(`Buy ${product.name}`)
                .setStyle(discord_js_1.ButtonStyle.Link)
                .setURL(buyUrl);
            const row = new discord_js_1.ActionRowBuilder().addComponents(btn);
            return interaction.reply({
                content: `Purchase **${product.name}** (${product.currency})`,
                components: [row],
            });
        }
    }
    catch (err) {
        console.error(err);
        if (interaction.isRepliable()) {
            interaction.reply({ content: `Error: ${(_e = err.message) !== null && _e !== void 0 ? _e : "unknown error"}`, ephemeral: true }).catch(() => { });
        }
    }
});
client.login(process.env.DISCORD_BOT_TOKEN);
