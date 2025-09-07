const { handleWarningButtons } = require("../commands/moderation/warnings");
const { handleScheduleModal } = require("../commands/schedule");

module.exports = function(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      // Handle warning buttons and modals
      if (
        interaction.isButton() &&
        (interaction.customId.startsWith("addwarn_") || interaction.customId.startsWith("removewarn_"))
      ) {
        await handleWarningButtons(client, interaction);
        return;
      }

      if (
        interaction.type === interaction.constructor.InteractionType.ModalSubmit &&
        (interaction.customId.startsWith("addwarn_") || interaction.customId.startsWith("removewarn_"))
      ) {
        await handleWarningButtons(client, interaction);
        return;
      }

      if (
        interaction.type === interaction.constructor.InteractionType.ModalSubmit &&
        interaction.customId.startsWith("schedule_create_modal")
      ) {
        await handleScheduleModal(interaction);
        return;
      }

      // Add other interaction handlers here as needed

    } catch (err) {
      console.error("Error handling interaction:", err);
      if (interaction.isRepliable()) {
        await interaction.reply({ content: "An error occurred while handling this interaction.", ephemeral: true });
      }
    }
  });
};