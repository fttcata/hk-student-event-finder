import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchMyTickets } from '../api/events.js';
import { formatDateTime, formatMoney } from '../utils/format.js';

export default function Profile() {
  const { user, logout } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    fetchMyTickets().then(setTickets).catch((requestError) => setError(requestError.message));
  }, []);

  return (
    <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Student Profile</h1>
      <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <h3>Account Information</h3>
        <p><strong>Email:</strong> {user?.email || 'N/A'}</p>
        <p><strong>User ID:</strong> {user?.id || user?.sub || 'N/A'}</p>
        <p><strong>Role:</strong> {user?.role || 'Student'}</p>
        
        <button 
          onClick={logout}
          style={{
            marginTop: '1rem',
            padding: '0.6rem 1.2rem',
            backgroundColor: '#ff3b30',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          Log Out
        </button>
      </div>
      <section style={{ marginTop: '1.5rem' }}>
        <h2>My Tickets</h2>
        {error && <p style={{ color: '#b42318' }}>{error}</p>}
        {!error && tickets.length === 0 && <p>No tickets acquired yet.</p>}
        {tickets.map((ticket) => (
          <article key={ticket.id} style={{ background: '#fff', padding: '1rem', marginTop: '0.75rem', borderRadius: '8px' }}>
            <h3>{ticket.event.title}</h3>
            <p>{formatDateTime(ticket.event.date)} · {ticket.event.location}</p>
            <p><strong>Unique code:</strong> {ticket.reference_code}</p>
            <p><strong>Price paid:</strong> {formatMoney(ticket.amount_paid)}</p>
          </article>
        ))}
      </section>
    </div>
  );
}