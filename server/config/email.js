import nodemailer from 'nodemailer'
import 'dotenv/config'

const smtpConfigured = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASSWORD,
)

export const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    })
  : null

export async function verifySmtpConfig() {
  if (!transporter) return false
  await transporter.verify()
  return true
}

export async function sendTestEmail(toEmail) {
  if (!transporter) throw new Error('SMTP is not configured')

  return transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: 'Campus Hub SMTP test',
    text: 'Your Campus Hub email configuration is working.',
  })
}
