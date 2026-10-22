import nodemailer from 'nodemailer'

const smtpConfigured = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASSWORD,
)

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER

export const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      // Receipts are sent inside the request, so an unreachable SMTP host must fail fast
      // instead of holding the response for nodemailer's 2-minute default.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    })
  : null

// Logged once at startup, so a missing or wrong SMTP setup is visible before receipts fail.
export async function reportSmtpStatus() {
  if (!transporter) {
    console.warn('SMTP is not configured (SMTP_HOST/PORT/USER/PASSWORD); email receipts will be logged as failed')
    return
  }
  try {
    await transporter.verify()
    console.log(`SMTP ready (${process.env.SMTP_HOST}:${process.env.SMTP_PORT})`)
  } catch (error) {
    console.warn(`SMTP check failed, email receipts will be logged as failed: ${error.message}`)
  }
}

// Throws when SMTP is not configured or the send fails; callers record the outcome in email_log.
export async function sendDonationReceipt({ user, event, pledge }) {
  if (!transporter) throw new Error('SMTP is not configured')

  const amount = `HK$${pledge.amount.toFixed(2)}`
  return transporter.sendMail({
    from: FROM,
    to: user.email,
    subject: `Donation receipt ${pledge.reference_code} — ${event.title}`,
    text: [
      `Hi ${user.name},`,
      '',
      `Thank you for donating ${amount} to "${event.title}".`,
      '',
      `Receipt reference: ${pledge.reference_code}`,
      `Amount: ${amount}`,
      `Date: ${pledge.created_at.toISOString()}`,
      `Raised so far: HK$${event.raised_amount.toFixed(2)} of HK$${event.fundraiser_goal.toFixed(2)}`,
      '',
      'Keep this email as proof of your donation.',
      '— Campus Hub',
    ].join('\n'),
  })
}
