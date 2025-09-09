const { config, saveConfig } = require("./storage");
const { sendBotShutdownMessage, setStatusChannelName } = require("./botStatus");
const { recordShutdown } = require("./shutdownState");
const { logError } = require("./errorUtil");
const { flushAll: flushPendingWrites } = require('./writeQueue');


module.exports = function(client) {
  const shutdownSignals = ["SIGINT", "SIGTERM", "SIGQUIT"];

  shutdownSignals.forEach(signal => {
    process.on(signal, async () => {
      try {
        config.testingMode = false;
        saveConfig();
        recordShutdown();
        if (client?.isReady && client.isReady()) {
          await setStatusChannelName(client, false);
          await sendBotShutdownMessage(client);
        }
        // Ensure any debounced file writes are flushed
        flushPendingWrites();
      } catch (err) {
        logError('shutdown', err);
      } finally { process.exit(0); }
    });
  });

  process.on("uncaughtException", async (err) => {
    try {
      logError('uncaughtException', err);
      config.testingMode = false; saveConfig(); recordShutdown();
      if (client?.isReady && client.isReady()) {
        await setStatusChannelName(client, false);
        await sendBotShutdownMessage(client);
      }
      flushPendingWrites();
    } catch (e) { logError('uncaughtException:handler', e); } finally { process.exit(1); }
  });

  process.on("unhandledRejection", (reason, promise) => {
    logError('unhandledRejection', reason || promise);
  });
};