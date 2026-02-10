import { requireEnv } from "@/lib/config";

const telegramApiBase = () => process.env.TELEGRAM_API_BASE_URL ?? "https://api.telegram.org";

export async function setTelegramWebhook(options: {
  botToken: string;
  secretToken: string;
}) {
  const baseUrl = process.env.TELEGRAM_WEBHOOK_BASE_URL ?? requireEnv("BASE_URL");
  const url = `${baseUrl.replace(/\/$/, "")}/api/webhooks/telegram`;
  const response = await fetch(`${telegramApiBase()}/bot${options.botToken}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: options.secretToken,
      allowed_updates: ["message"]
    })
  });

  const payload = await response.json();
  if (!response.ok || payload.ok !== true) {
    const description = payload.description ?? "Telegram webhook setup failed";
    throw new Error(description);
  }
}

export async function sendTelegramMessage(options: {
  botToken: string;
  chatId: string;
  text: string;
}) {
  const response = await fetch(`${telegramApiBase()}/bot${options.botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: options.chatId,
      text: options.text
    })
  });

  const payload = await response.json();
  if (!response.ok || payload.ok !== true) {
    const description = payload.description ?? "Telegram sendMessage failed";
    throw new Error(description);
  }
}
