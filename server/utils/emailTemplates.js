function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

export function generateTicketEmailHTML(studentName, eventTitle, ticketCode, pricePaid, eventDate, qrCid) {
  const qrImage = qrCid
    ? `<p style="text-align:center"><img src="cid:${escapeHtml(qrCid)}" alt="QR code for ticket ${escapeHtml(ticketCode)}" width="220" height="220" style="background:#ffffff;padding:8px;border-radius:4px" /></p>`
    : ''
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#202020"><h1>Ticket confirmation</h1><p>Hi ${escapeHtml(studentName)},</p><p>Your ticket for <strong>${escapeHtml(eventTitle)}</strong> is confirmed.</p>${qrImage}<table><tr><td>Ticket code</td><td><strong>${escapeHtml(ticketCode)}</strong></td></tr><tr><td>Event date</td><td>${escapeHtml(eventDate)}</td></tr><tr><td>Price paid</td><td>HK$${Number(pricePaid).toFixed(2)}</td></tr></table><p>Keep this email as your receipt.</p></div>`
}

// One email to the buyer with every ticket in the booking; each ticket's QR code is an inline
// attachment referenced by ticket.qrCid (see sendBookingSummary in config/email.js).
export function generateBookingSummaryEmailHTML(buyerName, eventTitle, tickets, eventDate, location, total) {
  const ticketCards = tickets.map((ticket) => (
    `<section style="border-top:1px solid #ddd;padding:16px 0"><p><strong>${escapeHtml(ticket.attendee.name)}</strong> &lt;${escapeHtml(ticket.attendee.email)}&gt;</p><p>Ticket code: <strong>${escapeHtml(ticket.ticket_code)}</strong></p><p><img src="cid:${escapeHtml(ticket.qrCid)}" alt="QR code for ticket ${escapeHtml(ticket.ticket_code)}" width="240" height="240"></p></section>`
  )).join('')

  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#202020"><h1>Booking confirmation</h1><p>Hi ${escapeHtml(buyerName)},</p><p>Here are all ${tickets.length} QR code${tickets.length === 1 ? '' : 's'} for your booking for <strong>${escapeHtml(eventTitle)}</strong>.</p>${ticketCards}<p>Event date: ${escapeHtml(eventDate)}<br>Location: ${escapeHtml(location)}<br>Total paid: HK$${Number(total).toFixed(2)}</p><p>Keep this email for entry to the event.</p></div>`
}
