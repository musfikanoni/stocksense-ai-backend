
export const DISCORD_URL = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export async function postToDiscord(webhookUrl: string, content: string): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: content.slice(0, 1900) }), signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Discord answered ${res.status}`);
}
