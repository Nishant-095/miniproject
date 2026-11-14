import nodemailer from "nodemailer";
let cachedTransport;
let cachedConfig;
export function emailConfigured() {
  // Checks whether email credentials are available.
  return Boolean(
    process.env.SMTP_HOST
      ? process.env.EMAIL_FROM || process.env.EMAIL_USER
      : process.env.EMAIL_USER && process.env.EMAIL_PASS,
  );
}
export function getEmailTransporter() {
  // Creates or reuses the configured email sender.
  if (!emailConfigured()) return null;
  const config = process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        ...(process.env.EMAIL_USER
          ? {
              auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
              },
            }
          : {}),
      }
    : {
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      };
  const key = JSON.stringify(config);
  if (cachedConfig !== key) {
    cachedTransport?.close();
    cachedTransport = nodemailer.createTransport({
      ...config,
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
    cachedConfig = key;
  }
  return cachedTransport;
}
export async function sendEmail({ to, subject, text, html }) {
  // Sends a message through the configured provider.
  const transport = getEmailTransporter();
  if (!transport) return false;
  const result = await transport.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject,
    text,
    html,
  });
  if (!result.accepted?.length)
    throw new Error("SMTP server did not accept the recipient.");
  return true;
}
