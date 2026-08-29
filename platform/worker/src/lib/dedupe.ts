// Job dedupe key: hash(portal + normalized title + normalized company), the
// Worker-side equivalent of local seen_jobs.json's per-portal dedup key.

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

export async function dedupeKey(portal: string, title: string, company: string): Promise<string> {
  const raw = `${portal}::${normalize(title)}::${normalize(company)}`
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
