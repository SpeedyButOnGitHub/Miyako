const { InteractionType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { ALLOWED_ROLES, CHATBOX_BUTTON_ID, isModerator, OWNER_ID } = require("../commands/moderation/permissions");
const { handleWarningButtons } = require("../commands/moderation/index");
const { config, saveConfig } = require("../utils/storage");
const { EMOJI_SUCCESS, EMOJI_ERROR } = require("../commands/moderation/replies");
const { renderSettingEmbed } = require("../commands/configMenu");
const { handleScheduleModal, handleEventCreateModal, handleEventEditModal } = require("../commands/schedule");
const ActiveMenus = require("../utils/activeMenus");
const { sendModLog } = require("../utils/modLogs");
const { sendUserDM } = require("../commands/moderation/dm");
const { parseDurationAndReason } = require("../utils/time");
const { handleBalanceCommand, buildDepositMenuPayload, buildWithdrawMenuPayload, buildBalancePayload, bankColor, buildStatusLine } = require("../commands/balance");
const { addProgress } = require("../utils/depositProgress");
const { depositToBank, withdrawFromBank, amountToNextThreshold, quoteDeposit, getBank, getBaseLimit, computeMaxAffordableDeposit, computeTaxForDeposit } = require("../utils/bank");
const { getCash, getTestingCash } = require("../utils/cash");
const theme = require("../utils/theme");

// Pending Kick/Ban confirmations: key = `${userId}:${action}:${moderatorId}` -> { reason: string|null, originChannelId?:string, originMessageId?:string }
const pendingPunishments = new Map();

function attachInteractionEvents(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      // Route persistent session UIs first
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
        const res = await ActiveMenus.processInteraction(interaction);
        if (res && res.handled) return;
      }

      // Cash balance quick button
      if (interaction.isButton() && interaction.customId && interaction.customId.startsWith("cash:check")) {
        // Reply ephemerally with the balance embed/buttons
        const { buildBalancePayload } = require("../commands/balance");
        const payload = buildBalancePayload(interaction.user.id);
        await interaction.reply({ ...payload, ephemeral: true }).catch(() => {});
        return;
      }

      // --- New Balance Menu System ---
      if (interaction.isButton() && interaction.customId === "bank:menu:deposit") {
        await interaction.deferUpdate().catch(() => {});
        try { await interaction.message.edit(buildDepositMenuPayload(interaction.user.id)); } catch {}
        return;
      }
      if (interaction.isButton() && interaction.customId === "bank:menu:withdraw") {
        await interaction.deferUpdate().catch(() => {});
        try { await interaction.message.edit(buildWithdrawMenuPayload(interaction.user.id)); } catch {}
        return;
      }
      if (interaction.isButton() && interaction.customId === "bank:back") {
        await interaction.deferUpdate().catch(() => {});
        try { await interaction.message.edit(buildBalancePayload(interaction.user.id)); } catch {}
        return;
      }

      // Deposit amount (opens modal) -> ephemeral confirmation
      if (interaction.isButton() && interaction.customId === "bank:deposit:amount") {
        const modalId = `bank_deposit_amount_${Date.now()}`;
        const modal = new ModalBuilder().setCustomId(modalId).setTitle("Deposit Amount").addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("amount").setLabel("Amount (number)").setStyle(TextInputStyle.Short).setRequired(true)
        ));
        await interaction.showModal(modal);
        const submitted = await interaction.awaitModalSubmit({ time: 30000, filter: i => i.customId === modalId && i.user.id === interaction.user.id }).catch(() => null);
        if (!submitted) return;
        const raw = submitted.fields.getTextInputValue("amount");
        const amt = Math.max(0, Math.floor(Number((raw||"").replace(/[^0-9]/g, "")) || 0));
        if (amt <= 0) { await submitted.reply({ content: "❌ Enter a positive amount.", ephemeral: true }); return; }
        const q = quoteDeposit(interaction.user.id, amt);
        if (!q.ok) { await submitted.reply({ content: "❌ Invalid amount.", ephemeral: true }); return; }
        const taxPct = q.deposit > 0 ? (q.tax / q.deposit) * 100 : 0;
        let warningLine = "";
        if (q.requiresConfirmation) {
          warningLine = `\n\n⚠️ **Warning:** Above / crossing daily limit. Tax: **$${q.tax.toLocaleString()}** (${taxPct.toFixed(1)}%) (Total Cost: **$${q.totalCost.toLocaleString()}**).`;
        } else if (q.tax > 0) {
          warningLine = `\n\nTax: **$${q.tax.toLocaleString()}** (${taxPct.toFixed(1)}%) (Total Cost: **$${q.totalCost.toLocaleString()}**).`;
        }
        const content = `Confirm depositing **$${q.deposit.toLocaleString()}**?${warningLine}`;
        const rootMsgId = interaction.message?.id; // original menu message id
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bank:confirm:${q.deposit}:${q.tax}:${q.totalCost}:${rootMsgId}`).setLabel("Confirm").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`bank:confirm:toLimit:${rootMsgId}`).setLabel("To Limit").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("bank:decline").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
        );
        await submitted.reply({ content, components: [row], ephemeral: true }).catch(() => {});
        return;
      }

      // Deposit Max logic per spec
      if (interaction.isButton() && interaction.customId === "bank:deposit:max") {
        const bankBal = getBank(interaction.user.id) || 0;
        const base = getBaseLimit();
        const maxAff = computeMaxAffordableDeposit(interaction.user.id);
        if (maxAff.deposit <= 0) {
          await interaction.reply({ content: "Nothing to deposit.", ephemeral: true }).catch(()=>{});
          return;
        }
        const taxPct = maxAff.deposit > 0 ? (maxAff.tax / maxAff.deposit) * 100 : 0;
        const warnNeeded = bankBal >= base || (bankBal < base && bankBal + maxAff.deposit > base);
        const warn = warnNeeded ? `\n\n⚠️ **Warning:** Above / crossing daily limit. Tax: **$${maxAff.tax.toLocaleString()}** (${taxPct.toFixed(1)}%) (Total Cost: **$${maxAff.totalCost.toLocaleString()}**).` : (maxAff.tax ? `\n\nTax: **$${maxAff.tax.toLocaleString()}** (${taxPct.toFixed(1)}%)` : "");
        const content = `Confirm Deposit Max: **$${maxAff.deposit.toLocaleString()}**?${warn}`;
        const rootMsgId = interaction.message?.id;
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bank:confirm:${maxAff.deposit}:${maxAff.tax}:${maxAff.totalCost}:${rootMsgId}`).setLabel("Confirm Max").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`bank:confirm:toLimit:${rootMsgId}`).setLabel("To Limit").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("bank:decline").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({ content, components: [row], ephemeral: true }).catch(()=>{});
        return;
      }

      // Withdraw amount
      if (interaction.isButton() && interaction.customId === "bank:withdraw:amount") {
        const modalId = `bank_withdraw_amount_${Date.now()}`;
        const modal = new ModalBuilder().setCustomId(modalId).setTitle("Withdraw Amount").addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("amount").setLabel("Amount (number)").setStyle(TextInputStyle.Short).setRequired(true)
        ));
        await interaction.showModal(modal);
        const submitted = await interaction.awaitModalSubmit({ time:30000, filter:i=>i.customId===modalId && i.user.id===interaction.user.id }).catch(()=>null);
        if (!submitted) return;
        const raw = submitted.fields.getTextInputValue("amount");
        const amt = Math.max(0, Math.floor(Number((raw||"").replace(/[^0-9]/g, ""))||0));
        if (amt<=0) { await submitted.reply({ content: "❌ Enter a positive amount.", ephemeral:true }); return; }
        if (amt > getBank(interaction.user.id)) { await submitted.reply({ content: "❌ You don't have that much in the bank.", ephemeral:true }); return; }
        const content = `Confirm withdrawing $${amt.toLocaleString()}?`;
        const rootMsgId = interaction.message?.id;
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bank:withdraw:confirm:${amt}:${rootMsgId}`).setLabel("Confirm").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("bank:decline").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
        );
        await submitted.reply({ content, components:[row], ephemeral:true }).catch(()=>{});
        return;
      }

      // Withdraw Max (no penalty) -> confirm
      if (interaction.isButton() && interaction.customId === "bank:withdraw:max") {
        const bankBal = getBank(interaction.user.id);
        if (bankBal <= 0) { await interaction.reply({ content: "Bank is empty.", ephemeral:true }).catch(()=>{}); return; }
        const rootMsgId = interaction.message?.id;
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bank:withdraw:confirm:${bankBal}:${rootMsgId}`).setLabel("Confirm Withdraw All").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("bank:decline").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({ content: `Withdraw all $${bankBal.toLocaleString()}?`, components:[row], ephemeral:true }).catch(()=>{});
        return;
      }

      // Confirmation handlers
      if (interaction.isButton() && interaction.customId.startsWith("bank:confirm:toLimit")) {
        const parts = interaction.customId.split(":");
        const rootId = parts[3];
        const base = getBaseLimit();
        const bankBal = getBank(interaction.user.id);
        if (bankBal >= base) {
          await interaction.reply({ content: "Already at or above the daily limit.", ephemeral:true }).catch(()=>{});
          return;
        }
        const needed = base - bankBal;
        const q = quoteDeposit(interaction.user.id, needed);
        if (!q.ok) { await interaction.reply({ content: "❌ Could not compute required amount.", ephemeral:true }).catch(()=>{}); return; }
  const res = depositToBank(interaction.user.id, q.deposit, { allowAboveLimit:true });
        if (!res.ok) { await interaction.reply({ content: `❌ ${res.error||"Deposit failed"}`, ephemeral:true }).catch(()=>{}); return; }
  addProgress(interaction.user.id, res.moved || 0);
  const pct = res.moved ? ((res.tax || 0) / res.moved) * 100 : 0;
  await interaction.reply({ content: `✅ Deposited $${res.moved.toLocaleString()} to reach the daily limit.${res.tax?` Tax $${res.tax.toLocaleString()} (${pct.toFixed(1)}%)`:''}`, ephemeral:true }).catch(()=>{});
        // Revert original menu (if we have the id) back to root balance
        if (rootId) {
          try {
            const channel = interaction.channel;
            if (channel?.messages?.fetch) {
              const rootMsg = await channel.messages.fetch(rootId).catch(()=>null);
              if (rootMsg) await rootMsg.edit(buildBalancePayload(interaction.user.id)).catch(()=>{});
            }
          } catch {}
        }
        return;
      }
      if (interaction.isButton() && interaction.customId.startsWith("bank:confirm:")) {
        const parts = interaction.customId.split(":");
        const depositAmt = Number(parts[2])||0;
        const tax = Number(parts[3])||0;
        const total = Number(parts[4])|| (depositAmt+tax);
        const rootId = parts[5];
        const res = depositToBank(interaction.user.id, depositAmt, { allowAboveLimit:true });
        if (!res.ok) { await interaction.reply({ content: `❌ ${res.error||"Deposit failed"}`, ephemeral:true }).catch(()=>{}); return; }
        addProgress(interaction.user.id, res.moved || 0);
        await interaction.reply({ content: `✅ Deposited $${res.moved.toLocaleString()}${tax?` (Tax $${tax.toLocaleString()})`:""}.`, ephemeral:true }).catch(()=>{});
        // Revert original menu back to balance root if we know it
        if (rootId) {
          try {
            const channel = interaction.channel;
            if (channel?.messages?.fetch) {
              const rootMsg = await channel.messages.fetch(rootId).catch(()=>null);
              if (rootMsg) await rootMsg.edit(buildBalancePayload(interaction.user.id)).catch(()=>{});
            }
          } catch {}
        }
        return;
      }
      if (interaction.isButton() && interaction.customId.startsWith("bank:withdraw:confirm:")) {
        const parts = interaction.customId.split(":");
        const amt = Number(parts[3])||0;
        const rootId = parts[4];
        const res = withdrawFromBank(interaction.user.id, amt);
        if (!res.ok) { await interaction.reply({ content: `❌ ${res.error||"Withdraw failed"}`, ephemeral:true }).catch(()=>{}); return; }
        await interaction.reply({ content: `✅ Withdrew $${res.moved.toLocaleString()}.`, ephemeral:true }).catch(()=>{});
        // Revert to root balance menu (withdraw does not affect progress)
        if (rootId) {
          try {
            const channel = interaction.channel;
            if (channel?.messages?.fetch) {
              const rootMsg = await channel.messages.fetch(rootId).catch(()=>null);
              if (rootMsg) await rootMsg.edit(buildBalancePayload(interaction.user.id)).catch(()=>{});
            }
          } catch {}
        }
        return;
      }
      if (interaction.isButton() && (interaction.customId === "bank:decline")) {
        await interaction.reply({ content: "❌ Cancelled.", ephemeral:true }).catch(()=>{});
        return;
      }

  // (Old handlers removed and replaced by new menu system above)

      // Warnings dashboard/buttons/selects/modals (only routes warns:*)
      if (
        (interaction.isButton() && interaction.customId?.startsWith("warns:")) ||
        (interaction.isStringSelectMenu() && interaction.customId?.startsWith("warns:")) ||
        (interaction.type === InteractionType.ModalSubmit && interaction.customId?.startsWith("warns:"))
      ) {
        await handleWarningButtons(client, interaction);
        return;
      }

      // Staff-only quick moderation actions from mod logs
      if (interaction.isButton() && interaction.customId?.startsWith("modact:")) {
        const parts = interaction.customId.split(":");
        // Patterns:
        // - modact:menu:<group>:<userId>
        // - modact:<action>:<userId>[:durationMs]
        // - modact:init:<kick|ban>:<userId>
        // - modact:confirm:<kick|ban>:<userId>
        // - modact:cancel:<kick|ban>:<userId>
        // - modact:changeReason:<kick|ban>:<userId>
        const kind = parts[1];
        const act = (kind === "menu" || ["init", "confirm", "cancel", "changeReason", "back"].includes(kind)) ? null : kind;
        const group = kind === "menu" ? parts[2] : null;
        const flowAction = ["init", "confirm", "cancel", "changeReason"].includes(kind) ? parts[2] : null; // kick|ban
        const uid = kind === "menu" ? parts[3] : (["init", "confirm", "cancel", "changeReason", "back"].includes(kind) ? parts[3] : parts[2]);
        const durMs = parts[4] ? Number(parts[4]) : (parts[3] && !["menu", "init", "confirm", "cancel", "changeReason", "back"].includes(kind) ? Number(parts[3]) : null);

        // Permission gate
        const member = interaction.member;
        if (!member || !isModerator(member)) {
          await interaction.reply({ content: `${EMOJI_ERROR} You are not allowed to use this.`, ephemeral: true }).catch(() => {});
          return;
        }

        // Resolve target
        const guild = interaction.guild;
        const targetMember = guild ? await guild.members.fetch(uid).catch(() => null) : null;
        const targetUser = targetMember?.user || (await client.users.fetch(uid).catch(() => null));
        if (!targetMember && !targetUser) {
          await interaction.reply({ content: `${EMOJI_ERROR} Could not resolve user.`, ephemeral: true }).catch(() => {});
          return;
        }

        const isTesting = !!config.testingMode;

        // Permission/hierarchy helpers for kick/ban
        const canActKickBan = (action) => {
          const g = interaction.guild;
          if (!g) return { ok: false, msg: `${EMOJI_ERROR} Not in a guild.` };
          const me = g.members?.me;
          const targetInGuild = !!targetMember;
          // Target membership constraints
          if (action === "kick" && !targetInGuild) {
            return { ok: false, msg: `${EMOJI_ERROR} That user is not in the server.` };
          }
          // Self-protection
          if (interaction.user.id === uid) {
            return { ok: false, msg: `${EMOJI_ERROR} You cannot ${action} yourself.` };
          }
          // Bot permission checks
          const needPerm = action === "kick" ? "KickMembers" : "BanMembers";
          if (!me || !me.permissions?.has?.(needPerm)) {
            return { ok: false, msg: `${EMOJI_ERROR} I lack permission to ${action} members.` };
          }
          // Role hierarchy checks when target is in guild
          if (targetInGuild) {
            const actorOwner = g.ownerId === interaction.user.id;
            if (!actorOwner) {
              const actorHighest = interaction.member?.roles?.highest?.position ?? 0;
              const targetHighest = targetMember.roles?.highest?.position ?? 0;
              if (actorHighest <= targetHighest) {
                return { ok: false, msg: `${EMOJI_ERROR} You cannot act on a member with an equal or higher role.` };
              }
            }
            const botHighest = me.roles?.highest?.position ?? 0;
            const targetHighest = targetMember.roles?.highest?.position ?? 0;
            if (botHighest <= targetHighest) {
              return { ok: false, msg: `${EMOJI_ERROR} I cannot act on a member with an equal or higher role than mine.` };
            }
          }
          return { ok: true };
        };

        // Helpers to access warnings store
        const ensureStores = () => {
          if (typeof config.warnings !== "object" || !config.warnings) config.warnings = {};
          if (typeof config.testingWarnings !== "object" || !config.testingWarnings) config.testingWarnings = {};
        };
        const getStore = () => (config.testingMode ? config.testingWarnings : config.warnings);
        const saveStore = () => { try { saveConfig(); } catch {} };

        // Helpers to build and swap rows on the original message
        const buildTopRow = () => new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`modact:menu:warnings:${uid}`).setLabel("Warnings").setStyle(ButtonStyle.Secondary).setEmoji("⚠️"),
          new ButtonBuilder().setCustomId(`modact:menu:mute:${uid}`).setLabel("Mute").setStyle(ButtonStyle.Secondary).setEmoji("⏰"),
          new ButtonBuilder().setCustomId(`modact:init:kick:${uid}`).setLabel("Kick").setStyle(ButtonStyle.Secondary).setEmoji("👢"),
          new ButtonBuilder().setCustomId(`modact:init:ban:${uid}`).setLabel("Ban").setStyle(ButtonStyle.Danger).setEmoji("🔨")
        );
        const swapRows = async (rows) => {
          await interaction.deferUpdate().catch(() => {});
          try { await interaction.message.edit({ components: rows }); } catch {}
        };

        // In-message submenus
        if (kind === "menu") {
          if (group === "warnings") {
            ensureStores();
            const store = getStore();
            const count = Array.isArray(store[uid]) ? store[uid].length : 0;
            const rows = [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`modact:addwarn:${uid}`).setLabel("Add Warn").setStyle(ButtonStyle.Secondary).setEmoji("➕"),
                new ButtonBuilder().setCustomId(`modact:removewarn:${uid}`).setLabel("Remove Warn").setStyle(ButtonStyle.Secondary).setEmoji("➖").setDisabled(count === 0),
                new ButtonBuilder().setCustomId(`modact:back:${uid}`).setLabel("Back").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
              )
            ];
            await swapRows(rows);
            return;
          } else if (group === "mute") {
            const isTimedOut = !!(targetMember?.communicationDisabledUntilTimestamp && targetMember.communicationDisabledUntilTimestamp > Date.now());
            const rows = [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`modact:mute:${uid}:3600000`).setLabel("1h").setStyle(ButtonStyle.Danger).setEmoji("⏱️"),
                new ButtonBuilder().setCustomId(`modact:mute:${uid}:7200000`).setLabel("2h").setStyle(ButtonStyle.Danger).setEmoji("⏱️"),
                new ButtonBuilder().setCustomId(`modact:mute:${uid}:21600000`).setLabel("6h").setStyle(ButtonStyle.Danger).setEmoji("⏱️"),
                new ButtonBuilder().setCustomId(`modact:mute:${uid}:86400000`).setLabel("24h").setStyle(ButtonStyle.Danger).setEmoji("⏱️")
              ),
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`modact:unmute:${uid}`).setLabel("Unmute").setStyle(ButtonStyle.Success).setEmoji("✅").setDisabled(!isTimedOut),
                new ButtonBuilder().setCustomId(`modact:back:${uid}`).setLabel("Back").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
              )
            ];
            await swapRows(rows);
            return;
          }
        }

        // Back to top-level row
        if (kind === "back") {
          await swapRows([buildTopRow()]);
          return;
        }

        // Kick/Ban flow: init -> optional reason -> ephemeral confirmation (confirm/cancel/changeReason)
        if (kind === "init" && (flowAction === "kick" || flowAction === "ban")) {
          const guard = canActKickBan(flowAction);
          if (!guard.ok) {
            await interaction.reply({ content: guard.msg, ephemeral: true }).catch(() => {});
            return;
          }
          // Prompt optional reason
          const modalId = `modact_reason_${flowAction}_${uid}_${Date.now()}`;
          const modal = new ModalBuilder()
            .setCustomId(modalId)
            .setTitle("Optional Reason")
            .addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("reason").setLabel("Reason (optional)").setStyle(TextInputStyle.Paragraph).setRequired(false)
            ));
          await interaction.showModal(modal);
          const submitted = await interaction.awaitModalSubmit({ time: 30000, filter: i => i.customId === modalId && i.user.id === interaction.user.id }).catch(() => null);
          if (!submitted) {
            // User closed/dismissed the modal — do not send any confirmation message
            return;
          }
          let reason = null;
          const r = submitted.fields.getTextInputValue("reason");
          if (r && r.trim()) reason = r.trim();
          const key = `${uid}:${flowAction}:${interaction.user.id}`;
          // store origin message so we can restore buttons on cancel/confirm
          pendingPunishments.set(key, { reason, originChannelId: interaction.channelId, originMessageId: interaction.message?.id });
          const reasonText = reason && reason.trim() ? reason.trim() : "None";
          const content = `<@${uid}> will be ${flowAction === "kick" ? "kicked" : "banned"}.\nAre you sure you would like to proceed?\n\nReason provided: ${reasonText}`;
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`modact:confirm:${flowAction}:${uid}`).setLabel("Confirm").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`modact:cancel:${flowAction}:${uid}`).setLabel("Cancel").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`modact:changeReason:${flowAction}:${uid}`).setLabel("Change Reason").setStyle(ButtonStyle.Primary)
          );
          await submitted.reply({ content, components: [row], ephemeral: true }).catch(() => {});
          return;
        }

        if ((kind === "confirm" || kind === "cancel" || kind === "changeReason") && (flowAction === "kick" || flowAction === "ban")) {
          const key = `${uid}:${flowAction}:${interaction.user.id}`;
          const state = pendingPunishments.get(key) || { reason: null };
          if (kind === "cancel") {
            await interaction.reply({ content: `${EMOJI_SUCCESS} ${flowAction === "kick" ? "Kick" : "Ban"} cancelled.`, ephemeral: true }).catch(() => {});
            pendingPunishments.delete(key);
            // restore original message buttons to top row
            try {
              if (state.originChannelId && state.originMessageId) {
                const channel = await client.channels.fetch(state.originChannelId).catch(() => null);
                const msg = await channel?.messages?.fetch?.(state.originMessageId).catch(() => null);
                if (msg) {
                  await msg.edit({ components: [buildTopRow()] }).catch(() => {});
                }
              }
            } catch {}
            return;
          }
          if (kind === "changeReason") {
            const modalId = `modact_reason_change_${flowAction}_${uid}_${Date.now()}`;
            const modal = new ModalBuilder()
              .setCustomId(modalId)
              .setTitle("Change Reason")
              .addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("reason").setLabel("Reason (optional)").setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(state.reason || "")
              ));
            await interaction.showModal(modal);
            const submitted = await interaction.awaitModalSubmit({ time: 30000, filter: i => i.customId === modalId && i.user.id === interaction.user.id }).catch(() => null);
            if (submitted) {
              const r = submitted.fields.getTextInputValue("reason");
              const newReason = r && r.trim() ? r.trim() : null;
              pendingPunishments.set(key, { reason: newReason, originChannelId: state.originChannelId, originMessageId: state.originMessageId });
              const reasonText = newReason ? newReason : "None";
              const content = `<@${uid}> will be ${flowAction === "kick" ? "kicked" : "banned"}.\nAre you sure you would like to proceed?\n\nReason provided: ${reasonText}`;
              const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`modact:confirm:${flowAction}:${uid}`).setLabel("Confirm").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`modact:cancel:${flowAction}:${uid}`).setLabel("Cancel").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`modact:changeReason:${flowAction}:${uid}`).setLabel("Change Reason").setStyle(ButtonStyle.Primary)
              );
              await submitted.reply({ content, components: [row], ephemeral: true }).catch(() => {});
            }
            return;
          }
          if (kind === "confirm") {
            const guard = canActKickBan(flowAction);
            if (!guard.ok) {
              await interaction.reply({ content: guard.msg, ephemeral: true }).catch(() => {});
              pendingPunishments.delete(key);
              // restore original message buttons to top row
              try {
                if (state.originChannelId && state.originMessageId) {
                  const channel = await client.channels.fetch(state.originChannelId).catch(() => null);
                  const msg = await channel?.messages?.fetch?.(state.originMessageId).catch(() => null);
                  if (msg) {
                    const buildTopRow = () => new ActionRowBuilder().addComponents(
                      new ButtonBuilder().setCustomId(`modact:menu:warnings:${uid}`).setLabel("Warnings").setStyle(ButtonStyle.Secondary).setEmoji("⚠️"),
                      new ButtonBuilder().setCustomId(`modact:menu:mute:${uid}`).setLabel("Mute").setStyle(ButtonStyle.Secondary).setEmoji("⏰"),
                      new ButtonBuilder().setCustomId(`modact:init:kick:${uid}`).setLabel("Kick").setStyle(ButtonStyle.Secondary).setEmoji("👢"),
                      new ButtonBuilder().setCustomId(`modact:init:ban:${uid}`).setLabel("Ban").setStyle(ButtonStyle.Danger).setEmoji("🔨")
                    );
                    await msg.edit({ components: [buildTopRow()] }).catch(() => {});
                  }
                }
              } catch {}
              return;
            }
            // Execute kick/ban with reason (default: no reason)
            const reason = state.reason || "No reason provided";
            if (!isTesting && targetMember) {
              try {
                if (flowAction === "kick") await targetMember.kick(reason);
                else await targetMember.ban({ reason });
              } catch {}
            } else if (!isTesting && !targetMember && flowAction === "ban" && interaction.guild) {
              try { await interaction.guild.members.ban(uid, { reason }); } catch {}
            }
            await sendUserDM(targetMember || targetUser, flowAction === "kick" ? "kicked" : "banned", null, reason);
            await sendModLog(client, targetMember || targetUser, interaction.user, flowAction === "kick" ? "kicked" : "banned", reason, true, null, null);
            pendingPunishments.delete(key);
            await interaction.reply({ content: `${EMOJI_SUCCESS} ${flowAction === "kick" ? "Kick" : "Ban"} issued${isTesting ? " (testing)" : ""}.`, ephemeral: true }).catch(() => {});
            // restore original message buttons to top row
            try {
              if (state.originChannelId && state.originMessageId) {
                const channel = await client.channels.fetch(state.originChannelId).catch(() => null);
                const msg = await channel?.messages?.fetch?.(state.originMessageId).catch(() => null);
                if (msg) {
                  await msg.edit({ components: [buildTopRow()] }).catch(() => {});
                }
              }
            } catch {}
            return;
          }
        }

        // Warn/mute/unmute actions
        if (act === "addwarn") {
          // Persist a warning and evaluate simple escalation
          ensureStores();
          const store = getStore();
          const arr = Array.isArray(store[uid]) ? store[uid] : [];
          const entry = { moderator: interaction.user.id, reason: null, date: Date.now(), logMsgId: null };
          arr.push(entry);
          store[uid] = arr;
          saveStore();

          const total = arr.length;
          const esc = config.escalation || {};
          const muteT = Math.max(1, Number(esc.muteThreshold || 3));
          const kickT = Math.max(muteT + 1, Number(esc.kickThreshold || 5));
          const muteMs = Number.isFinite(esc.muteDuration) ? esc.muteDuration : 2 * 60 * 60 * 1000;

          let extra = null, durText = null;
          if (total >= kickT) {
            extra = `Due to reaching ${total} warnings, you have been kicked.`;
            if (!isTesting && targetMember) { try { await targetMember.kick(); } catch {} }
          } else if (total >= muteT) {
            extra = `Due to reaching ${total} warnings, you have been muted.`;
            if (!isTesting && targetMember) { try { await targetMember.timeout(Math.min(muteMs, 14*24*60*60*1000)); } catch {} }
            const ms = require("ms"); durText = ms(muteMs, { long: true });
          }
          // remaining line
          let remainingLine = null;
          if (total < muteT) remainingLine = `${muteT - total} warning${muteT - total === 1 ? "" : "s"} remaining until mute`;
          else if (total < kickT) remainingLine = `${kickT - total} warning${kickT - total === 1 ? "" : "s"} remaining until kick`;

          await sendUserDM(targetMember || targetUser, "warned", durText, null, `${remainingLine ? remainingLine+"\n" : ""}${extra || ""}`.trim());
          const combinedReason = extra || null;
          const nxtRemain = remainingLine ? parseInt((remainingLine.match(/^(\d+)/)||[0,0])[1],10)||0 : 0;
          await sendModLog(client, targetMember || targetUser, interaction.user, "warned", combinedReason, true, durText, nxtRemain);
          // Refresh submenu state
          const count = arr.length;
          const rows = [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`modact:addwarn:${uid}`).setLabel("Add Warn").setStyle(ButtonStyle.Secondary).setEmoji("➕"),
              new ButtonBuilder().setCustomId(`modact:removewarn:${uid}`).setLabel("Remove Warn").setStyle(ButtonStyle.Secondary).setEmoji("➖").setDisabled(count === 0),
              new ButtonBuilder().setCustomId(`modact:back:${uid}`).setLabel("Back").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
            )
          ];
          await interaction.deferUpdate().catch(() => {});
          try { await interaction.message.edit({ components: rows }); } catch {}
          return;
        }

        if (act === "removewarn") {
          // Remove last warning if exists
          ensureStores();
          const store = getStore();
          const arr = Array.isArray(store[uid]) ? store[uid] : [];
          if (!arr.length) {
            await interaction.deferUpdate().catch(() => {});
            return;
          }
          const removed = arr.pop();
          store[uid] = arr; saveStore();
          // recompute remaining
          const esc = config.escalation || {};
          const muteT = Math.max(1, Number(esc.muteThreshold || 3));
          const kickT = Math.max(muteT + 1, Number(esc.kickThreshold || 5));
          let remainingLine = null;
          if (arr.length < muteT) remainingLine = `${muteT - arr.length} warning${muteT - arr.length === 1 ? "" : "s"} remaining until mute`;
          else if (arr.length < kickT) remainingLine = `${kickT - arr.length} warning${kickT - arr.length === 1 ? "" : "s"} remaining until kick`;
          const nxtRemain = remainingLine ? parseInt((remainingLine.match(/^(\d+)/)||[0,0])[1],10)||0 : 0;
          await sendUserDM(targetMember || targetUser, "warning removed", null, null, null);
          const reasonForLog = remainingLine ? `${removed?.reason || "No reason"}\n\n${remainingLine}` : `${removed?.reason || "No reason"}`;
          await sendModLog(client, targetMember || targetUser, interaction.user, "warning removed", reasonForLog, true, null, nxtRemain);
          const count = arr.length;
          const rows = [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`modact:addwarn:${uid}`).setLabel("Add Warn").setStyle(ButtonStyle.Secondary).setEmoji("➕"),
              new ButtonBuilder().setCustomId(`modact:removewarn:${uid}`).setLabel("Remove Warn").setStyle(ButtonStyle.Secondary).setEmoji("➖").setDisabled(count === 0),
              new ButtonBuilder().setCustomId(`modact:back:${uid}`).setLabel("Back").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
            )
          ];
          await interaction.deferUpdate().catch(() => {});
          try { await interaction.message.edit({ components: rows }); } catch {}
          return;
        }

        if (act === "mute") {
          // Apply timeout if possible
          if (!isTesting && targetMember && typeof targetMember.timeout === "function" && Number.isFinite(durMs)) {
            try { await targetMember.timeout(Math.min(durMs, 14 * 24 * 60 * 60 * 1000)); } catch {}
          }
          const ms = require("ms");
          const durText = Number.isFinite(durMs) ? ms(durMs, { long: true }) : null;
          await sendUserDM(targetMember || targetUser, "muted", durText, null);
          await sendModLog(client, targetMember || targetUser, interaction.user, "muted", null, true, durText, null);
          // Refresh mute submenu
          const isTimedOut = !!(targetMember?.communicationDisabledUntilTimestamp && targetMember.communicationDisabledUntilTimestamp > Date.now());
          const rows = [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`modact:mute:${uid}:3600000`).setLabel("1h").setStyle(ButtonStyle.Danger).setEmoji("⏱️"),
              new ButtonBuilder().setCustomId(`modact:mute:${uid}:7200000`).setLabel("2h").setStyle(ButtonStyle.Danger).setEmoji("⏱️"),
              new ButtonBuilder().setCustomId(`modact:mute:${uid}:21600000`).setLabel("6h").setStyle(ButtonStyle.Danger).setEmoji("⏱️"),
              new ButtonBuilder().setCustomId(`modact:mute:${uid}:86400000`).setLabel("24h").setStyle(ButtonStyle.Danger).setEmoji("⏱️")
            ),
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`modact:unmute:${uid}`).setLabel("Unmute").setStyle(ButtonStyle.Success).setEmoji("✅").setDisabled(!isTimedOut),
              new ButtonBuilder().setCustomId(`modact:back:${uid}`).setLabel("Back").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
            )
          ];
          await interaction.deferUpdate().catch(() => {});
          try { await interaction.message.edit({ components: rows }); } catch {}
          return;
        }

        if (act === "unmute") {
          if (!isTesting && targetMember) {
            try { if (typeof targetMember.timeout === "function") await targetMember.timeout(null); } catch {}
          }
          await sendUserDM(targetMember || targetUser, "unmuted");
          await sendModLog(client, targetMember || targetUser, interaction.user, "unmuted", null, false, null, null);
          const isTimedOut = !!(targetMember?.communicationDisabledUntilTimestamp && targetMember.communicationDisabledUntilTimestamp > Date.now());
          const rows = [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`modact:mute:${uid}:3600000`).setLabel("1h").setStyle(ButtonStyle.Danger).setEmoji("⏱️"),
              new ButtonBuilder().setCustomId(`modact:mute:${uid}:7200000`).setLabel("2h").setStyle(ButtonStyle.Danger).setEmoji("⏱️"),
              new ButtonBuilder().setCustomId(`modact:mute:${uid}:21600000`).setLabel("6h").setStyle(ButtonStyle.Danger).setEmoji("⏱️"),
              new ButtonBuilder().setCustomId(`modact:mute:${uid}:86400000`).setLabel("24h").setStyle(ButtonStyle.Danger).setEmoji("⏱️")
            ),
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`modact:unmute:${uid}`).setLabel("Unmute").setStyle(ButtonStyle.Success).setEmoji("✅").setDisabled(!isTimedOut),
              new ButtonBuilder().setCustomId(`modact:back:${uid}`).setLabel("Back").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
            )
          ];
          await interaction.deferUpdate().catch(() => {});
          try { await interaction.message.edit({ components: rows }); } catch {}
          return;
        }

        if (act === "kick" || act === "ban") {
          // Legacy direct actions not used; route to init flow
          await interaction.deferUpdate().catch(() => {});
          return;
        }

        // Unknown/modact fallthrough
        await interaction.reply({ content: `${EMOJI_ERROR} Unknown action.`, ephemeral: true }).catch(() => {});
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
              const components = Array.isArray(row) ? row : [row];
              await msg.edit({ embeds: [embed], components }).catch(() => {});
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
      // Event creation modal submit (id pattern: event_create_modal_<managerMessageId>)
      if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith("event_create_modal")) {
        await handleEventCreateModal(interaction);
        return;
      }
  if (interaction.type === InteractionType.ModalSubmit && /^event_(times|days|msg|edit)_modal_/.test(interaction.customId)) {
        await handleEventEditModal(interaction);
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
