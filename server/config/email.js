import nodemailer from 'nodemailer'
import QRCode from 'qrcode'
import { generateTicketEmailHTML } from '../utils/emailTemplates.js'
import { generateBookingSummaryEmailHTML } from '../utils/emailTemplates.js'

const TICKET_QR_CID = 'ticket-qr@campushub'

const smtpConfigured = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASSWORD,
)

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

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

export async function sendVerificationEmail({ name, email, code }) {
  if (!transporter) throw new Error('SMTP is not configured')
  const safeName = escapeHtml(name)
  const safeCode = escapeHtml(code)
  return transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Verify your Campus Hub account',
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#202020"><h1>Verify your Campus Hub account</h1><p>Hi ${safeName},</p><p>Use this verification code to activate your account:</p><p style="font-size:24px;font-weight:bold;letter-spacing:3px">${safeCode}</p><p>This code can only be used once.</p></div>`,
    text: [`Hi ${name},`, '', 'Use this verification code to activate your Campus Hub account:', code, '', 'This code can only be used once.'].join('\n'),
  })
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

// Throws when SMTP is not configured or the send fails; callers record the outcome in email_log.
export async function sendTicketReceipt({ user, event, ticket }) {
  if (!transporter) throw new Error('SMTP is not configured')

  const amount = `HK$${Number(ticket.amount_paid).toFixed(2)}`
  const qrCode = await QRCode.toBuffer(ticket.ticket_code, { margin: 1, width: 220 })
  return transporter.sendMail({
    from: FROM,
    to: user.email,
    subject: `Ticket confirmed ${ticket.ticket_code} — ${event.title}`,
    html: generateTicketEmailHTML(
      user.name,
      event.title,
      ticket.ticket_code,
      ticket.amount_paid,
      new Date(event.date).toISOString(),
      TICKET_QR_CID,
    ),
    attachments: [
      {
        filename: 'ticket-qr.png',
        content: qrCode,
        cid: TICKET_QR_CID,
      },
    ],
    text: [
      `Hi ${user.name},`,
      '',
      `Your ticket for "${event.title}" is confirmed.`,
      '',
      `Ticket code: ${ticket.ticket_code}`,
      `Type: ${ticket.type}`,
      `Date: ${new Date(event.date).toISOString()}`,
      `Location: ${event.location}`,
      `Amount paid: ${amount}`,
      '',
      'Show this email (or the ticket code) at the entrance.',
      '— Campus Hub',
    ].join('\n'),
  })
}

// Sent to the buyer when they book seats for other students. Each attendee still gets their own
// ticket receipt above; this message is the buyer's record of the whole purchase.
// Sent only to the buyer for every booking; the message contains every ticket QR code.
export async function sendBookingSummary({ user, event, tickets }) {
  if (!transporter) throw new Error('SMTP is not configured')

  const total = tickets.reduce((sum, ticket) => sum + Number(ticket.amount_paid), 0)
  const ticketsWithQr = await Promise.all(tickets.map(async (ticket) => ({
    ...ticket,
    qrCid: `booking-qr-${ticket.ticket_code}`,
    qrCode: await QRCode.toBuffer(ticket.ticket_code, { type: 'png', width: 320, margin: 2 }),
  })))
  return transporter.sendMail({
    from: FROM,
    to: user.email,
    subject: `Group booking confirmed — ${event.title}`,
    html: generateBookingSummaryEmailHTML(
      user.name,
      event.title,
      ticketsWithQr,
      new Date(event.date).toISOString(),
      event.location,
      total,
    ),
    attachments: ticketsWithQr.map((ticket) => ({
      filename: `ticket-${ticket.ticket_code}.png`,
      content: ticket.qrCode,
      cid: ticket.qrCid,
    })),
    text: [
      `Hi ${user.name},`,
      '',
      `You booked ${tickets.length} ticket(s) for "${event.title}".`,
      '',
      ...tickets.map(
        (ticket) =>
          `${ticket.ticket_code} — ${ticket.attendee.name} <${ticket.attendee.email}>`,
      ),
      '',
      `Event date: ${new Date(event.date).toISOString()}`,
      `Location: ${event.location}`,
      `Total paid: HK$${total.toFixed(2)}`,
      '',
      'This email includes the QR code for every ticket in the booking.',
      '— Campus Hub',
    ].join('\n'),
  })
}
