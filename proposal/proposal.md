# Event Finder for HK Students

## Member Information:
Full Name	Email	UID
Petre Andrei Catalin	U3671504@connect.hku.hk    3036715041
Masud Muradli	U3636593@connect.hku.hk     3036365937
Fung Kai Yui	U3622444@connect.hku.hk     3036224444
Gaspar Montes	U3672012@connect.hku.hk     3036720125
Li Cheuk Hei	ansonhei@connect.hku.hk     3036234281

## Project Name
Honky

## Project Description

Event Finder for HK Students is a centralized responsive web platform that aggregates student activities across Hong Kong universities, including hackathons, career fairs, society socials, sports competitions, and cultural events. It reduces the fragmentation caused by scattered Instagram posts, WhatsApp links, posters, and email newsletters by giving students one place to discover and organize campus activities. The target end-users are university students looking for events and student organizers or club leaders who need to publish and manage them.



## Feature List

### Must-have

- Student registration and login using verified Hong Kong university email addresses, such as `@connect.hku.hk` and `@link.cuhk.edu.hk`.
- Role-based authorization for students, organizers, and administrators.
- Event creation, viewing, editing, and deletion for authorized organizers.
- Event fields for title, description, university, venue, date, time, category, organizer, and seat limit.
- Event discovery through keyword search, date filtering, and category filtering for Academic, Cultural, Sports, Career, and Social events.
- Student event details page with current capacity and remaining-seat information.
- RSVP and cancellation workflows with database validation to prevent registrations beyond the seat limit.
- Organizer roster view showing students registered for an event.
- Student dashboard showing upcoming RSVPs and bookmarked events.
- Responsive interface that works on desktop and mobile screens.

### Nice-to-have

- Real-time seat availability updates without refreshing the page.
- Event bookmarks and calendar-style personal schedule management.
- Ratings and reviews for completed events.
- Email notifications for RSVP confirmations, cancellations, and event updates.
- University-specific event feeds and personalized recommendations.
- Image uploads for event banners and organizer profiles.
- Exporting confirmed events to an external calendar such as Google Calendar.
- Pagination, sorting, and advanced filtering for large event catalogues.

## Technology Stack

| Area | Selection | Purpose |
| --- | --- | --- |
| Frontend framework | React with Vite | Builds the responsive single-page application and reusable event, dashboard, and management components. |
| Frontend styling and routing | Tailwind CSS and React Router | Provides responsive styling and client-side navigation. |
| Backend framework | Node.js with Express | Provides the REST API, authentication flow, role-based authorization, and event/RSVP CRUD endpoints. |
| Database | MySQL 8.0 with `mysql2` | Stores users, universities, events, RSVPs, bookmarks, reviews, and organizer data using standard parameterized SQL queries. |
| Deployment platform | Docker and Docker Compose | Runs the MySQL database, Express API, and React production build as separate containers. The React build is served by Nginx. |
| External third-party integrations | None required for the core version | The core application will use its own database and API. Optional future integrations include an SMTP email provider and Google Calendar API. |

## Preliminary Task Allocation
Catalin : Group Leader (Docker containerization, security compliance, environment configurations, and examiner documentation)
Masud : Frontend (Core views, Search/Filters, Primary User Actions)
Anson : Frontend (User State, Profile Dashboard, Secondary Features)
Louis : Backend (Database Architecture, Core Querying, Data Integrity)
Gaspar : Backend (Auth Security, Middleware, Auxiliary APIs)