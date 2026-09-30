import type { EmailMessage } from "./send";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(options: {
  heading: string;
  intro: string;
  action: string;
  url: string;
  outro: string;
}): string {
  const url = escapeHtml(options.url);
  return `<!doctype html>
<html><body style="margin:0;background:#fbfaf7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#16181d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e4e1d9;border-radius:12px">
<tr><td style="padding:32px">
<p style="margin:0 0 24px;font-family:Georgia,serif;font-size:20px">Authoro</p>
<h1 style="margin:0 0 12px;font-size:18px;font-weight:600">${escapeHtml(options.heading)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5b606b">${escapeHtml(options.intro)}</p>
<p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#16181d;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px">${escapeHtml(options.action)}</a></p>
<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#5b606b">${escapeHtml(options.outro)}</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:#8a8f98;word-break:break-all">${url}</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

function greeting(name: string | null | undefined): string {
  return name?.trim() ? `Hi ${name.trim()},` : "Hi,";
}

export function verificationEmail(to: string, name: string | null | undefined, url: string): EmailMessage {
  const intro = "Confirm your email address to finish creating your Authoro account.";
  const outro = "This link expires in 24 hours. If you didn't create an account, you can ignore this email.";
  return {
    to,
    subject: "Confirm your email for Authoro",
    text: `${greeting(name)}\n\n${intro}\n\n${url}\n\n${outro}`,
    html: layout({ heading: "Confirm your email", intro, action: "Confirm email", url, outro }),
  };
}

export function magicLinkEmail(to: string, url: string): EmailMessage {
  const intro = "Use this link to sign in to Authoro. It can be used once.";
  const outro = "This link expires in 10 minutes. If you didn't ask to sign in, you can ignore this email.";
  return {
    to,
    subject: "Your Authoro sign-in link",
    text: `Hi,\n\n${intro}\n\n${url}\n\n${outro}`,
    html: layout({ heading: "Sign in to Authoro", intro, action: "Sign in", url, outro }),
  };
}

export function resetPasswordEmail(to: string, name: string | null | undefined, url: string): EmailMessage {
  const intro =
    "Someone asked to reset the password for your Authoro account. Use this link to choose a new one.";
  const outro =
    "This link expires in 1 hour. If you didn't ask for this, you can ignore this email and your password stays the same.";
  return {
    to,
    subject: "Reset your Authoro password",
    text: `${greeting(name)}\n\n${intro}\n\n${url}\n\n${outro}`,
    html: layout({ heading: "Reset your password", intro, action: "Choose a new password", url, outro }),
  };
}
