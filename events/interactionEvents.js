const { InteractionType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
const { ALLOWED_ROLES, CHATBOX_BUTTON_ID } = require("../commands/moderation/permissions");
const { handleWarningButtons } = require("../commands/moderation/index");
const { config, saveConfig } = require("../utils/storage");
const { EMOJI_SUCCESS, EMOJI_ERROR } = require("../commands/moderation/replies");
const { renderSettingEmbed } = require("../commands/configMenu");
const { handleScheduleModal } = require("../commands/schedule");
const ActiveMenus = require("../utils/activeMenus");

function attachInteractionEvents(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      // Route persistent session UIs first
      if (interaction.isButton()) {
        const res = await ActiveMenus.processInteraction(interaction);
        if (res && res.handled) return;
      }

      // Warnings dashboard/buttons/selects/modals (only routes warns:*)
      if (
        (interaction.isButton() && interaction.customId?.startsWith("warns:")) ||
        (interaction.isStringSelectMenu() && interaction.customId?.startsWith("warns:")) ||
        (interaction.type === InteractionType.ModalSubmit && interaction.customId?.startsWith("warns:"))
      ) {
        await handleWarningButtons(client, interaction);
        return;
      }

      // StaffTeam Chatbox Button
      if (interaction.isButton() && interaction.customId === CHATBOX_BUTTON_ID) {
        const member = interaction.member;
        const hasRole = member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
        if (!hasRole) {
          await interaction.reply({ content: "You are not allowed to use this", ephemeral: true });
          return;
        }
        await interaction.showModal(
          new ModalBuilder()
            .setCustomId("staffteam_chatbox_modal")
            .setTitle("Staff Team Chatbox")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("chatbox_input")
                  .setLabel("Type your message")
                  .setStyle(TextInputStyle.Paragraph)
                  .setRequired(true)
              )
            )
        );
        return;
      }

      // StaffTeam Chatbox Modal Submit
      if (interaction.type === InteractionType.ModalSubmit && interaction.customId === "staffteam_chatbox_modal") {
        const member = interaction.member;
        const hasRole = member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
        if (!hasRole) {
          await interaction.reply({ content: "You are not allowed to use this.", ephemeral: true });
          return;
        }
        const messageContent = interaction.fields.getTextInputValue("chatbox_input");
        const channel = await client.channels.fetch("1232701768383729790").catch(() => null);
        if (channel) {
          await channel.send({ content: `💬 **Staff Chatbox Message from <@${member.id}>:**\n${messageContent}` });
        }
        await interaction.reply({ content: "Your message has been sent!", ephemeral: true });
        return;
      }

      // Snipe config modal submit (add/remove channel)
      if (
        interaction.type === InteractionType.ModalSubmit &&
        interaction.customId.startsWith("modal_snipe_")
      ) {
        const parts = interaction.customId.split("_");
        // modal_snipe_{action}_{messageId}_{category}_{setting}
        const action = parts[2];
        const originMessageId = parts[3];
        const originCategory = parts[4];
        const originSetting = parts[5];
        const raw = interaction.fields.getTextInputValue("channelInput");
        const channelId = (raw || "").replace(/[^0-9]/g, "");
        const channel = interaction.guild?.channels?.cache?.get(channelId);
        if (!channel) {
          await interaction.reply({ content: `${EMOJI_ERROR} Invalid or unknown channel.`, ephemeral: true });
          return;
        }

        const mode = config.snipeMode === "blacklist" ? "blacklist" : "whitelist";
        if (mode === "whitelist") {
          if (action === "addChannel") {
            if (!Array.isArray(config.snipingWhitelist)) config.snipingWhitelist = [];
            if (!config.snipingWhitelist.includes(channel.id)) {
              config.snipingWhitelist.push(channel.id);
              saveConfig();
              await interaction.reply({ content: `${EMOJI_SUCCESS} Added <#${channel.id}> to whitelist.`, ephemeral: true });
            } else {
              await interaction.reply({ content: `${EMOJI_ERROR} Channel already in whitelist.`, ephemeral: true });
            }
          } else if (action === "removeChannel") {
            if (Array.isArray(config.snipingWhitelist) && config.snipingWhitelist.includes(channel.id)) {
              config.snipingWhitelist = config.snipingWhitelist.filter(id => id !== channel.id);
              saveConfig();
              await interaction.reply({ content: `${EMOJI_SUCCESS} Removed <#${channel.id}> from whitelist.`, ephemeral: true });
            } else {
              await interaction.reply({ content: `${EMOJI_ERROR} Channel not in whitelist.`, ephemeral: true });
            }
          } else {
            await interaction.reply({ content: `${EMOJI_ERROR} Unknown action.`, ephemeral: true });
          }
        } else {
          // blacklist mode uses snipingChannelList
          if (action === "addChannel") {
            if (!Array.isArray(config.snipingChannelList)) config.snipingChannelList = [];
            if (!config.snipingChannelList.includes(channel.id)) {
              config.snipingChannelList.push(channel.id);
              saveConfig();
              await interaction.reply({ content: `${EMOJI_SUCCESS} Added <#${channel.id}> to blacklist.`, ephemeral: true });
            } else {
              await interaction.reply({ content: `${EMOJI_ERROR} Channel already in blacklist.`, ephemeral: true });
            }
          } else if (action === "removeChannel") {
            if (Array.isArray(config.snipingChannelList) && config.snipingChannelList.includes(channel.id)) {
              config.snipingChannelList = config.snipingChannelList.filter(id => id !== channel.id);
              saveConfig();
              await interaction.reply({ content: `${EMOJI_SUCCESS} Removed <#${channel.id}> from blacklist.`, ephemeral: true });
            } else {
              await interaction.reply({ content: `${EMOJI_ERROR} Channel not in blacklist.`, ephemeral: true });
            }
          } else {
            await interaction.reply({ content: `${EMOJI_ERROR} Unknown action.`, ephemeral: true });
          }
        }
        // Try to refresh the original config menu message embed if visible
        try {
          if (originMessageId && originCategory && originSetting) {
            const msg = await interaction.channel.messages.fetch(originMessageId).catch(() => null);
            if (msg) {
              const { embed, row } = renderSettingEmbed(originCategory, originSetting);
              await msg.edit({ embeds: [embed], components: [row] }).catch(() => {});
            }
          }
        } catch {}
        return;
      }

      // Schedule creation modal submit
      if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith("schedule_create_modal")) {
        await handleScheduleModal(interaction);
        return;
      }
    } catch (err) {
      console.error("[Interaction Error]", err);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `An error occurred.\n${err.message || err}`, ephemeral: true }).catch(() => {});
      }
    }
  });
}

module.exports = { attachInteractionEvents };
