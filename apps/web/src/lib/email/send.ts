import { serverEnv } from "@/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends a transactional email through Resend. Without RESEND_API_KEY,
 * development and Vercel preview deployments print the message (including any
 * links) to the server log; production refuses rather than silently dropping mail.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const { RESEND_API_KEY, EMAIL_FROM } = serverEnv();

  if (!RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview") {
      throw new Error("RESEND_API_KEY is not set; refusing to drop email in production.");
    }
    console.info(
      [
        "",
        "── email (not sent: no RESEND_API_KEY) ──",
        `To: ${message.to}`,
        `Subject: ${message.subject}`,
        "",
        message.text,
        "──────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend rejected the email (${response.status}): ${await response.text()}`);
  }
}
