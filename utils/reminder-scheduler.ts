import { statements } from "../database/reminder-db";
import { sendDm } from "./discord";
import { msg } from "./errors";

const POLL_MS = 30_000;
const BATCH = 25;
const MAX_ATTEMPTS = 3;

async function tick(): Promise<void> {
  let due;
  try {
    due = statements.listDue.all(Date.now(), BATCH);
  } catch (e) {
    console.error(`[reminders] listDue failed: ${msg(e)}`);
    return;
  }

  for (const r of due) {
    try {
      await sendDm(r.discord_user_id, {
        content: `⏰ Reminder #${r.id}: ${r.text}`,
      });
      statements.markSent.run(Date.now(), r.id);
      console.error(
        `[reminders] delivered #${r.id} to ${r.discord_user_id}`,
      );
    } catch (e) {
      statements.bumpAttempts.run(r.id);
      const attempts = r.send_attempts + 1;
      const tail = attempts >= MAX_ATTEMPTS ? " (giving up)" : "";
      console.error(
        `[reminders] delivery of #${r.id} to ${r.discord_user_id} failed ` +
          `(attempt ${attempts}/${MAX_ATTEMPTS})${tail}: ${msg(e)}`,
      );
    }
  }
}

export function startReminderScheduler(): void {
  const loop = () => {
    void tick();
  };
  const timer = setInterval(loop, POLL_MS);
  timer.unref?.();

  // Small delay so the server can finish booting before the first sweep.
  const kick = setTimeout(loop, 2_000);
  kick.unref?.();

  console.error(
    `[reminders] scheduler started (poll every ${POLL_MS / 1000}s)`,
  );
}
