// src/bot/index.ts
import type { Product } from "@prisma/client";
import "dotenv/config";
import { Client, GatewayIntentBits, Interaction, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits } from "discord.js";
import { z } from "zod";
import { prisma } from "../lib/db";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user?.tag}`);
});

// Helpers
function requireGuild(interaction: Interaction): asserts interaction is any {
  if (!interaction.isChatInputCommand() || !interaction.guildId) {
    throw new Error("Guild context required.");
  }
}
function isAdminOrOwner(interaction: any) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || interaction.guild?.ownerId === interaction.user.id;
}

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // -----------------------
    // /pay-set
    // -----------------------
    if (commandName === "pay-set") {
      requireGuild(interaction);
      if (!isAdminOrOwner(interaction)) {
        return interaction.reply({ content: "You need Administrator to run this.", ephemeral: true });
      }
      const ChainBody = z.object({
        chain: z.string().min(2),
        address: z.string().min(4),
      });
      const parsed = ChainBody.parse({
        chain: interaction.options.getString("chain", true).toUpperCase(),
        address: interaction.options.getString("address", true),
      });

      const server = await prisma.server.upsert({
        where: { guildId: interaction.guildId! },
        update: { chain: parsed.chain, payoutWallet: parsed.address },
        create: {
          guildId: interaction.guildId!,
          ownerDiscordId: interaction.guild?.ownerId ?? interaction.user.id,
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

      const server = await prisma.server.findUnique({ where: { guildId: interaction.guildId! } });
      if (!server) {
        return interaction.reply({ content: "⚠️ Server not configured. Run `/pay-set` first.", ephemeral: true });
      }

      const product = await prisma.product.create({
        data: {
          name,
          description: null,
          serverId: server.id,
          currency,
          priceWei: price,
          chain: server.chain,
          roleId: role?.id ?? null,
          active: true,
        },
      });

      const embed = new EmbedBuilder()
        .setTitle("Product created")
        .addFields(
          { name: "ID", value: product.id },
          { name: "Name", value: product.name, inline: true },
          { name: "Currency", value: product.currency, inline: true },
          { name: "Price (wei)", value: product.priceWei, inline: true },
          { name: "Role", value: product.roleId ? `<@&${product.roleId}>` : "—", inline: true },
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // -----------------------
    // /product-set-role
    // -----------------------
    if (commandName === "product-set-role") {
      requireGuild(interaction);
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({ content: "You need Manage Roles permission.", ephemeral: true });
      }
      const productId = interaction.options.getString("product_id", true);
      const role = interaction.options.getRole("role", true);

      // Role hierarchy safety: bot must be able to manage the role
      const me = await interaction.guild!.members.fetchMe();
      const targetRole = await interaction.guild!.roles.fetch(role.id);
      if (!targetRole || me.roles.highest.comparePositionTo(targetRole) <= 0) {
        return interaction.reply({ content: "❌ I can’t manage that role. Move my bot role above the target role.", ephemeral: true });
      }

      const product = await prisma.product.update({
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

      const product = await prisma.product.update({
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

      const server = await prisma.server.findUnique({ where: { guildId: interaction.guildId! } });
      if (!server) return interaction.reply({ content: "⚠️ Server not configured. Run `/pay-set` first.", ephemeral: true });

      const products = await prisma.product.findMany({ where: { serverId: server.id, active: true }, orderBy: { createdAt: "desc" } });
      if (products.length === 0) return interaction.reply({ content: "No active products yet.", ephemeral: true });

      const lines = products.map((p: Product) =>
		`• **${p.name}** \`(${p.id})\` – ${p.currency} @ wei=${p.priceWei}${p.roleId ? ` – role <@&${p.roleId}>` : ""}`
).join("\n");

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

      await prisma.product.update({ where: { id: productId }, data: { active: false } });
      return interaction.reply({ content: `🗑️ Product \`${productId}\` set inactive.`, ephemeral: true });
    }

    // -----------------------
    // /buy-post
    // -----------------------
    if (commandName === "buy-post") {
      requireGuild(interaction);
      const productId = interaction.options.getString("product_id", true);

      // Optional: validate product belongs to this guild & is active
      const server = await prisma.server.findUnique({ where: { guildId: interaction.guildId! } });
      if (!server) return interaction.reply({ content: "⚠️ Server not configured. Run `/pay-set` first.", ephemeral: true });

      const product = await prisma.product.findFirst({
        where: { id: productId, serverId: server.id, active: true },
      });
      if (!product) return interaction.reply({ content: "Product not found for this server.", ephemeral: true });

      // Build a purchase link that your frontend understands.
      // Your product page should call your /api/invoices POST with { productId, buyerDiscordId }.
      const buyUrl = `${APP_URL}/products/${product.id}?buyer=${interaction.user.id}`;

      const btn = new ButtonBuilder()
        .setLabel(`Buy ${product.name}`)
        .setStyle(ButtonStyle.Link)
        .setURL(buyUrl);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);

      return interaction.reply({
        content: `Purchase **${product.name}** (${product.currency})`,
        components: [row],
      });
    }
  } catch (err: any) {
    console.error(err);
    if (interaction.isRepliable()) {
      interaction.reply({ content: `Error: ${err.message ?? "unknown error"}`, ephemeral: true }).catch(() => {});
    }
  }
});


client.login(process.env.DISCORD_BOT_TOKEN);
