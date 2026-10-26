export default function TicketCounter({ available, capacity, soldOut }) {
  return (
    <span className={`badge ${soldOut ? 'bg-accent/10 text-accent' : 'bg-sage'}`}>
      {available} / {capacity} Tickets Remaining
    </span>
  )
}
