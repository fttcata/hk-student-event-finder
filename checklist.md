# Campus Hub Feature Checklist

This checklist compares the proposal in [`proposal/proposal.md`](./proposal/proposal.md)
with the current implementation. `Implemented` means the feature is present in the
application; `Partial` means only part of the proposal requirement is covered;
`Missing` means no working implementation was found.

## Must-have features

| Status | Feature | Notes / implementation evidence |
|---|---|---|
| Implemented | Registration and login restricted to verified Hong Kong university email domains | Domain validation, email verification, login, and protected actions are implemented in `server/routes/auth.js` and `client/src/pages/VerifyPage.jsx`. |
| Implemented | Public event browsing with authentication for booking, creation, donations, and chat | Public event routes are available; protected actions use `ProtectedRoute` and server auth middleware. |
| Implemented | Keyword search and filters for free, paid, and fundraiser events | Search and filters are available in `client/src/pages/EventsPage.jsx`. |
| Partial | Map-based location discovery | Event detail pages have Google Maps embeds and event creation supports click-to-pin when an API key is configured; the catalogue does not currently provide a shared interactive map with markers, and address search is not implemented. |
| Implemented | Event details with venue, map, type, capacity, deadline, organizer, and price/fundraising goal | Implemented in `client/src/pages/EventDetailPage.jsx` and the event API serializers. |
| Implemented | Event creation and editing for standard and fundraiser events | Implemented in `client/src/pages/CreateEventPage.jsx` and the event routes. |
| Partial | Location pinning through address search or interactive map selection | Interactive click-to-pin is implemented in `client/src/components/MapPicker.jsx`; address search is missing. |
| Implemented | Free ticket claiming and paid booking through mock checkout | Implemented in `client/src/pages/TicketCheckoutPage.jsx` and ticket endpoints. |
| Implemented | Capacity enforcement | Booking transactions lock event rows and reject bookings when capacity is exhausted. |
| Implemented | Fundraiser pledges with target and dynamically calculated progress | Pledge submission, goal display, and progress totals are implemented in the fundraiser UI and event routes. |
| Implemented | Booking and donation receipts with event information and unique references | Ticket codes, pledge references, and receipt emails are implemented in `server/config/email.js` and the event routes. |
| Implemented | Student dashboard for booked events, created events, and fundraising campaigns | Dashboard tabs cover tickets, pledges, and organized events in `client/src/pages/DashboardPage.jsx`. |
| Partial | Organizer management tools for updating listings, viewing attendees, and managing capacity | Editing, cancellation, deletion, and booking/capacity summaries are implemented. A dedicated organizer attendee-management view was not found. |
| Implemented | Responsive mobile and desktop layout | Responsive Tailwind layouts are used throughout the client pages and components. |

## Nice-to-have features

| Status | Feature | Notes / implementation evidence |
|---|---|---|
| Partial | Real-time ticket availability and fundraiser progress without refresh | Values are calculated from the API when pages load, but there is no live polling or WebSocket update for event availability/progress. |
| Partial | Automated email receipts and reminders through a production email provider | SMTP/Nodemailer receipt and verification email support exists; automated event reminders and a configured production provider are not implemented. |
| Implemented | Event chat rooms with timed access | Chat polls every four seconds and uses the event time window; server authorization restricts access to eligible ticket holders/donors. |
| Implemented | Event bookmarks and personal schedule management | Bookmarking and saved events are available through the dashboard. |
| Missing | Ratings and reviews for completed events | No working rating/review workflow was found. |
| Partial | Image uploads for event banners, campaign materials, and organizer profiles | Events can retain image URLs from scraped data, but user image upload/storage workflows are missing. |
| Missing | University-specific feeds and personalized recommendations | University filtering exists, but personalized feeds or recommendation logic were not found. |
| Missing | Exporting confirmed events to Google Calendar | No calendar export workflow was found. |
| Missing | Production payment integration | Paid tickets use the mock checkout workflow; Stripe or another production payment provider is not integrated. |
| Partial | Pagination, sorting, and advanced filtering for large catalogues | Backend pagination and filtering support exists, but the public catalogue does not expose complete pagination/sorting controls. |

## Summary

- **Must-have:** 10 implemented, 3 partial, 0 missing.
- **Nice-to-have:** 2 implemented, 4 partial, 4 missing.

The counts classify partially covered requirements separately from fully implemented
requirements. They should be revisited after integrating the catalogue map, organizer
attendee management, reminders, reviews, uploads, recommendations, calendar export,
and production payments.
