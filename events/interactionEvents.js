const { InteractionType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
const { ALLOWED_ROLES, CHATBOX_BUTTON_ID } = require("../commands/moderation/permissions");
const { handleWarningButtons } = require("../commands/moderation/index");

function attachInteractionEvents(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
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

      // Moderation warning buttons and modals
      if (interaction.isButton() && (interaction.customId.startsWith("addwarn_") || interaction.customId.startsWith("removewarn_"))) {
        await handleWarningButtons(client, interaction);
        return;
      }
      if (interaction.type === InteractionType.ModalSubmit && (interaction.customId.startsWith("addwarn_") || interaction.customId.startsWith("removewarn_"))) {
        await handleWarningButtons(client, interaction);
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
