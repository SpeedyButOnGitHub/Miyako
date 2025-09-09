const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { OWNER_ID } = require("./moderation/permissions");
const { sendModLog } = require("../utils/modLogs");
const { config, saveConfig } = require("../utils/storage");
const { logMemberLeave } = require("../utils/memberLogs");
const { TEST_LOG_CHANNEL } = require("../utils/logChannels");
const { spawnTestDrop, activeDrops } = require("../utils/cashDrops");
const { clearTestingCash, getTestingCash } = require("../utils/cash");
const theme = require("../utils/theme");

const CATEGORY_ROOT = "root";

function buildRootEmbed() {
  return new EmbedBuilder()
    .setTitle("🧪 Test Console")
    .setColor(theme.colors.primary)
    .setDescription("Pick a category to test features in a safe sandbox that does not affect production data.")
    .addFields(
      { name: "General", value: "Warnings, Logs, Member events", inline: false },
      { name: "Events", value: "Economy, Cash Drops", inline: false },
    )
    .setFooter({ text: `Testing Mode: ${config.testingMode ? "ON" : "OFF"}` });
}

function buildRootRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("test:cat:general").setLabel("General").setEmoji("🧰").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("test:cat:events").setLabel("Events").setEmoji("🎟️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("test:toggle").setLabel(config.testingMode ? "Disable" : "Enable").setEmoji("🧪").setStyle(config.testingMode ? ButtonStyle.Danger : ButtonStyle.Success),
  );
}

function buildEventsEmbed() {
  return new EmbedBuilder()
    .setTitle("🎟️ Test: Events")
    .setColor(theme.colors.neutral)
    .setDescription("Choose an event category to test.")
    .addFields({ name: "Economy", value: "Cash Drops" });
}

function buildEventsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("test:events:economy").setLabel("Economy").setEmoji("💰").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("test:back:root").setLabel("Back").setEmoji("⬅️").setStyle(ButtonStyle.Secondary),
  );
}

function buildEconomyEmbed() {
  const bal = getTestingCash(OWNER_ID);
  return new EmbedBuilder()
    .setTitle("💰 Test: Economy — Cash Drops")
    .setColor(theme.colors.primary)
    .setDescription(
      "Spawn a test cash drop in the testing channel and try claiming it.\n" +
      "Test-mode drops and balances are sandboxed and do not affect real cash."
    )
    .addFields({ name: "Your test balance", value: `$${bal.toLocaleString()}`, inline: true });
}

function buildEconomyRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("test:econ:spawn").setLabel("Spawn Test Drop").setEmoji("🪙").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("test:econ:clear").setLabel("Clear Test Balances").setEmoji("🧹").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("test:back:events").setLabel("Back").setEmoji("⬅️").setStyle(ButtonStyle.Secondary),
  );
}

async function handleTestCommand(client, message) {
  if (String(message.author.id) !== String(OWNER_ID)) return;

  const sent = await message.channel.send({ embeds: [buildRootEmbed()], components: [buildRootRow()] });
  const collector = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: 5 * 60 * 1000 });

  collector.on("collect", async (interaction) => {
    try {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({ content: "This menu is not for you.", ephemeral: true });
      }
      const id = interaction.customId;

      if (id === "test:toggle") {
        config.testingMode = !config.testingMode;
        // Do NOT clear testing balances; they must persist across toggles & restarts
        saveConfig();
        return interaction.update({ embeds: [buildRootEmbed()], components: [buildRootRow()] });
      }

      if (id === "test:cat:general") {
        const embed = new EmbedBuilder()
          .setTitle("🧰 Test: General")
          .setColor(theme.colors.neutral)
          .setDescription("This section will hold general testing utilities (warnings, logs, member leave/join). Coming soon.");
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("test:back:root").setLabel("Back").setEmoji("⬅️").setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
      }

      if (id === "test:cat:events") {
        return interaction.update({ embeds: [buildEventsEmbed()], components: [buildEventsRow()] });
      }

      if (id === "test:back:root") {
        return interaction.update({ embeds: [buildRootEmbed()], components: [buildRootRow()] });
      }

      if (id === "test:back:events") {
        return interaction.update({ embeds: [buildEventsEmbed()], components: [buildEventsRow()] });
      }

      if (id === "test:events:economy") {
        return interaction.update({ embeds: [buildEconomyEmbed()], components: [buildEconomyRow()] });
      }

      if (id === "test:econ:spawn") {
        if (!config.testingMode) {
          return interaction.reply({ content: "Enable Testing Mode first.", ephemeral: true });
        }
        const modalId = `test:econ:spawn:${Date.now()}`;
        const modal = new ModalBuilder().setCustomId(modalId).setTitle("Spawn Test Cash Drop");
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("amount").setLabel("Amount (optional)").setStyle(TextInputStyle.Short).setRequired(false)
        ));
        await interaction.showModal(modal);
        const submitted = await interaction.awaitModalSubmit({ time: 30000, filter: i => i.customId === modalId && i.user.id === interaction.user.id }).catch(() => null);
        if (!submitted) return;
        const raw = submitted.fields.getTextInputValue("amount").trim();
        const num = raw ? Math.max(1, Math.floor(Number(raw) || 0)) : undefined;
        const drop = spawnTestDrop(num);
        const channel = await client.channels.fetch(TEST_LOG_CHANNEL).catch(() => null);
        if (channel) {
          const { EmbedBuilder } = require("discord.js");
          const embed = new EmbedBuilder()
            .setTitle("🧪 Test Cash Drop")
            .setColor(theme.colors.warning)
            .setDescription(`Type this word to claim it first:\n\n→ \`${drop.word}\``)
            .addFields({ name: "Reward", value: `**$${drop.amount.toLocaleString()}**`, inline: true })
            .setFooter({ text: "First correct message wins (testing)." });
          await channel.send({ embeds: [embed], components: [] }).catch(() => {});
        }
        await submitted.reply({ content: `Spawned a test drop of ${drop.amount} in <#${TEST_LOG_CHANNEL}>.`, ephemeral: true });
        // Stay on economy view and refresh balance row
        try { await interaction.message.edit({ embeds: [buildEconomyEmbed()], components: [buildEconomyRow()] }); } catch {}
        return;
      }

      if (id === "test:econ:clear") {
        clearTestingCash();
        return interaction.update({ embeds: [buildEconomyEmbed()], components: [buildEconomyRow()] });
      }

    } catch (err) {
      console.error("[test] error:", err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "Error handling interaction.", ephemeral: true });
      }
    }
  });

  collector.on("end", async () => {
    try {
      const ActiveMenus = require("../utils/activeMenus");
      const { timeoutRow } = ActiveMenus;
      await sent.edit({ components: [timeoutRow()] });
    } catch { try { await sent.edit({ components: [] }); } catch {} }
  });
}

module.exports = { handleTestCommand };