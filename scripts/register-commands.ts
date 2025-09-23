// scripts/register-commands.ts
import "dotenv/config";
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN!);
const CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DEV_GUILD_ID = process.env.DISCORD_DEV_GUILD_ID; // optional

// Define commands
const commands = [
  // Server-wide config
  new SlashCommandBuilder()
    .setName("pay-set")
    .setDescription("Set payout settings for this server")
    .addStringOption(o =>
      o.setName("chain").setDescription("Chain (e.g., POLYGON, ETH)").setRequired(true))
    .addStringOption(o =>
      o.setName("address").setDescription("Payout wallet address").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // Product management
  new SlashCommandBuilder()
    .setName("product-create")
    .setDescription("Create a product for sale")
    .addStringOption(o => o.setName("name").setDescription("Product name").setRequired(true))
    .addStringOption(o => o.setName("currency").setDescription("Token symbol or NATIVE").setRequired(true))
    .addStringOption(o => o.setName("price").setDescription("Price in wei (string)").setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role to grant on payment").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("product-set-role")
    .setDescription("Attach a Discord role to a product")
    .addStringOption(o => o.setName("product_id").setDescription("Product ID").setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role to grant").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName("product-set-price")
    .setDescription("Update product price/currency")
    .addStringOption(o => o.setName("product_id").setDescription("Product ID").setRequired(true))
    .addStringOption(o => o.setName("price").setDescription("New price (wei)").setRequired(true))
    .addStringOption(o => o.setName("currency").setDescription("New currency").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("product-list")
    .setDescription("List products for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("product-delete")
    .setDescription("Delete a product")
    .addStringOption(o => o.setName("product_id").setDescription("Product ID").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // Buyer-facing helper: post a buy button for a product
  new SlashCommandBuilder()
    .setName("buy-post")
    .setDescription("Post a purchase button for a product")
    .addStringOption(o => o.setName("product_id").setDescription("Product ID").setRequired(true)),
].map(c => c.toJSON());

async function main() {
  if (DEV_GUILD_ID) {
    // Guild-scoped (faster updates while developing)
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, DEV_GUILD_ID), { body: commands });
    console.log("✅ Registered guild commands");
  } else {
    // Global (takes up to ~1 hour to propagate)
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("✅ Registered global commands");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
