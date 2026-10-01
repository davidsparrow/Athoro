import { after } from "next/server";
import { sendEmail, type EmailMessage } from "./send";

/**
 * Sends after the response, so a slow mail provider never delays it and
 * response timing doesn't reveal whether an address has an account.
 */
export function sendLater(message: EmailMessage) {
  after(() =>
    sendEmail(message).catch((error) => console.error("Failed to send email", message.subject, error)),
  );
}
