export function generateTicketEmailHTML(studentName, eventTitle, ticketCode, pricePaid, eventDate) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#202020"><h1>Ticket confirmation</h1><p>Hi ${studentName},</p><p>Your ticket for <strong>${eventTitle}</strong> is confirmed.</p><table><tr><td>Ticket code</td><td><strong>${ticketCode}</strong></td></tr><tr><td>Event date</td><td>${eventDate}</td></tr><tr><td>Price paid</td><td>HK$${Number(pricePaid).toFixed(2)}</td></tr></table><p>Keep this email as your receipt.</p></div>`
}
