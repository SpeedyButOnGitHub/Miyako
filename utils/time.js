import ms from "ms";

function parseDurationAndReason(args) {
  let duration = null;
  let reasonParts = [];
  for (const arg of args) {
    const parsed = ms(arg);
    if (parsed && !duration) {
      duration = parsed;
    } else {
      reasonParts.push(arg);
    }
  }
  const reason = reasonParts.join(" ").trim() || null;
  return { duration, reason };
}

export { parseDurationAndReason, ms };
Fix 