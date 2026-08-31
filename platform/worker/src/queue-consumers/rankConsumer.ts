import type { Env, RankQueueMessage } from "../types.js"
import { getJob } from "../lib/db/repositories/jobs.js"
import { getProfile } from "../lib/db/repositories/profiles.js"
import { findUserById } from "../lib/db/repositories/users.js"
import { saveRanking } from "../lib/db/repositories/rankings.js"
import { rankJobWithClaude } from "../lib/ranking/claudeClient.js"
import { weightedScore, verdictForScore, isVetoed } from "../lib/ranking/schema.js"
import { autoDraftApplication } from "../lib/documents/autoDraft.js"

/**
 * Consumes one `rank-job-queue` message: one Claude API call scoring a
 * single (user, job) pair against the rubric in
 * .claude/skills/job-application-assistant/04-job-evaluation.md, writing the
 * result to user_job_rankings. Retries (via the queue's own retry/backoff)
 * on transient failures rather than swallowing them.
 */
export async function handleRankMessage(env: Env, message: RankQueueMessage): Promise<void> {
  const [job, profile] = await Promise.all([getJob(env, message.jobId), getProfile(env, message.userId)])
  if (!job) return // job was removed/expired since this message was enqueued
  if (!profile) return // user deleted their profile since this message was enqueued

  const result = await rankJobWithClaude(env, { job, profile })
  await saveRanking(env, message.userId, message.jobId, result, profile.profileVersion)

  if (!profile.autoApplyEnabled || isVetoed(result)) return
  const verdict = verdictForScore(weightedScore(result.scores))
  if (verdict !== "Strong Fit" && verdict !== "Good Fit") return

  const user = await findUserById(env, message.userId)
  if (!user) return
  try {
    await autoDraftApplication(env, { userId: message.userId, userEmail: user.email, job, profile })
  } catch (err) {
    // Never let a document-generation failure retry the whole ranking
    // message -- the ranking itself already saved successfully above.
    console.error("auto-draft application failed:", err)
  }
}
