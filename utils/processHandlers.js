const { config, saveConfig } = require("./storage");
const { sendBotShutdownMessage, setStatusChannelName } = require("./botStatus");


module.exports = function(client) {
  const shutdownSignals = ["SIGINT", "SIGTERM", "SIGQUIT"];

  shutdownSignals.forEach(signal => {
    process.on(signal, async () => {
      try {
        config.testingMode = false;
        saveConfig();
        if (client?.isReady && client.isReady()) {
          await setStatusChannelName(client, false);
          await sendBotShutdownMessage(client);
        }
      } catch (err) {
        console.error("Error during shutdown sequence:", err);
      } finally {
        process.exit(0);
      }
    });
  });

  process.on("uncaughtException", async (err) => {
    try {
      console.error("Uncaught Exception:", err);
      config.testingMode = false;
      saveConfig();
      if (client?.isReady && client.isReady()) {
        await setStatusChannelName(client, false);
        await sendBotShutdownMessage(client);
      }
    } catch (e) {
      console.error("Error handling uncaughtException:", e);
    } finally {
      process.exit(1);
    }
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
  });
};