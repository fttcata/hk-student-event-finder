# Campus Hub: Streamlining Student Events and Community Fundraising

## Member Information:
Full Name	Email	UID
Petre Andrei Catalin	u3671504@connect.hku.hk    3036715041
Masud Muradli	u3636593@connect.hku.hk     3036365937
Fung Kai Yui	u3622444@connect.hku.hk     3036224444
Gaspar Montes	u3672012@connect.hku.hk     3036720125
Li Cheuk Hei	ansonhei@connect.hku.hk     3036234281

## Project Name
Campus Hub

## Project Description

Campus Hub is a responsive web platform for verified university students in Hong Kong, including students from HKU, CUHK, and PolyU, to discover, attend, organize, and support campus events and grassroots fundraising campaigns. It brings event listings, campus map locations, free and paid ticketing, fundraiser pledges, booking confirmations, and timed pre-event communication into one place instead of scattering them across messaging groups, posters, and social media. The primary target users are verified university students, who can use the platform as event attendees, event organizers, or community fundraisers.

## Problem and Target User Context

Student activities and charitable initiatives are difficult to discover because organizers depend on fragmented instant messaging groups, physical posters, and general social media platforms. Students can miss relevant activities, struggle to find venues across urban campuses, and lack a reliable way to confirm attendance. Organizers also need simple tools to manage capacity, distinguish free and paid attendance, issue booking confirmations, and communicate with participants. Students running charity campaigns face an additional challenge because they lack a transparent way to collect pledges and show progress toward fundraising goals. Campus Hub addresses these issues through university-domain authentication, localized map-based discovery, ticketing, fundraising, and event-specific communication in a browser-based platform accessible from mobile and desktop devices.

## High-Level Workflow

Step 1: Authentication & Onboarding
A student opens the application and registers using their official university email address (@connect.hku.hk, @link.cuhk.edu.hk, etc.). Upon logging in, they land on the main Event Catalog. Unauthenticated visitors can browse listings, but restricted actions (such as booking tickets, hosting events, donating, or chatting) prompt them to sign in.

Step 2: Discovery & Exploration
On the Event Catalog page, students explore upcoming events through an interactive Google Map paired with a filterable listing grid:
Map View: Interactive pin markers highlight event locations across Hong Kong campuses and local venues.
Filter Controls: Students toggle between event types: Free Events, Paid Events, or Fundraiser Events.

Step 3: Viewing Details & Taking Action
Clicking on an event card opens the Event Detail Page, displaying venue location details, an interactive map snippet, total capacity counters, and a live registration countdown timer (showing remaining time until registration closes 24 hours prior to start).
Standard Events (Free or Paid): The student clicks "Claim Free Ticket" or "Buy Ticket". For paid events, a mock checkout modal opens to handle payment details. Upon confirmation, the application instantly updates the remaining ticket counter and dispatches an automated email confirmation receipt containing event details and a unique ticket verification code directly to the student's inbox.
Fundraiser Events: The page highlights the organizer's cause statement (e.g., "Running a marathon for mental health awareness"), target financial goal, and a dynamic progress bar showing current funds raised. Supporters click "Donate / Support" to submit a monetary pledge, immediately updating the progress bar and sending a donation email receipt.

Step 4: Event Creation & Management
Any logged-in student can navigate to the Create Event page to host an activity or launch a campaign:
Event Type Selection: Choose between a Standard Event or Fundraiser Event.
Location Pinning: Use an integrated address search or click directly on the interactive Google Map to set the venue pin.
Ticketing Configuration: Set the available ticket capacity count and set the ticket price ($0 for free events).
Fundraiser Fields (if applicable): Enter the stated cause/pledge description and target goal amount. Once submitted, the system publishes the event to the map catalog and generates a management dashboard in the student's personal profile.

Step 5: Real-Time Chat & Post-Event Interaction
Six hours before an event begins, the Event Chat Room unlocks automatically on the event page. This chat space is strictly reserved for verified ticket holders. Attendees use this room to coordinate travel, ask organizers questions, or meet fellow participants. The chat room remains active during the event and stays open for 7 days post-event before automatically closing, leaving students with a shared space to wrap up discussion.

```text
	 [ Visit Platform ]
		   |
		   v
   [ Browse Events and Map ]
		   |
	+--------+--------+
	v                 v
[ Standard Event ]  [ Fundraiser ]
	|                 |
	v                 v
[ Buy/Claim Ticket ] [ Donate Pledge ]
	|                 |
	+--------+--------+
		   v
  [ Email Receipt Received ]
		   |
		   v
 [ Pre-Event Chat Opens at T-6 Hours ]
```

### User Journey

1. **Authentication and onboarding:** Visitors can browse public listings, while students sign up and log in with an official university email address such as `@connect.hku.hk` or `@link.cuhk.edu.hk` to access restricted actions.
2. **Discovery and exploration:** Students use the event catalogue, interactive Google Map markers, and filters for free events, paid events, and fundraiser events.
3. **Event details and action:** An event page shows its location, map preview, capacity, registration deadline countdown, ticketing or donation controls, and relevant organizer information.
4. **Ticketing and fundraising:** Students claim free tickets, complete a mock paid checkout, or submit fundraiser pledges. The system updates capacity or fundraising progress and sends an email receipt with a booking or donation reference.
5. **Event creation and management:** Any authenticated student can create a standard event or fundraiser, pin its location, configure capacity or ticket price, enter fundraiser details, and manage the published listing from their profile.
6. **Chat and post-event interaction:** A chat room opens six hours before the event for verified ticket holders, remains available during the event, and closes automatically seven days after the event.

## Feature List

### Must-have

- Registration and login restricted to verified Hong Kong university email domains.
- Public event browsing with authentication required for booking, event creation, donations, and chat participation.
- Event catalogue with keyword search, map-based location discovery, and filters for free, paid, and fundraiser events.
- Event details page showing title, description, venue, interactive map location, event type, capacity, registration deadline, organizer, and price or fundraising goal.
- Event creation and editing for standard events and fundraiser events.
- Location pinning through address search or interactive map selection.
- Free ticket claiming and paid ticket booking through a mock checkout workflow.
- Capacity enforcement that prevents bookings after the event reaches its seat limit.
- Fundraiser pledge submission with a target amount and dynamically updated progress total.
- Booking and donation confirmation receipts containing event information and a unique reference or verification code.
- Student dashboard for viewing booked events, created events, and fundraising campaigns.
- Organizer management tools for updating listings, viewing attendees, and managing capacity.
- Responsive layout for mobile and desktop browsers.

### Nice-to-have

- Real-time ticket availability and fundraiser progress updates without refreshing the page.
- Automated email receipts and reminders through a production email provider.
- Event chat rooms that unlock six hours before an event and close seven days after it ends.
- Event bookmarks and calendar-style personal schedule management.
- Ratings and reviews for completed events.
- Image uploads for event banners, campaign materials, and organizer profiles.
- University-specific feeds and personalized event recommendations.
- Exporting confirmed events to Google Calendar.
- Production payment integration instead of the mock checkout flow.
- Pagination, sorting, and advanced filtering for large event catalogues.

## Technology Stack

| Area | Selection | Purpose |
| --- | --- | --- |
| Frontend framework | React with Vite | Builds the responsive single-page application, event catalogue, map view, ticketing screens, dashboards, and fundraiser pages. |
| Frontend styling and routing | Tailwind CSS and React Router | Provides responsive styling and client-side navigation between catalogues, details, dashboards, and management screens. |
| Backend framework | Node.js with Express | Provides the REST API, authentication, authorization, event and ticketing workflows, fundraiser endpoints, email triggers, and chat access rules. |
| Database | MySQL 8.0 with `mysql2` | Stores users, university email identities, events, categories, tickets, fundraiser pledges, chat messages, and organizer data using standard parameterized SQL queries. |
| Deployment platform | Docker and Docker Compose | Runs the MySQL database, Express API, and React production build as separate containers. The React build is served by Nginx. |
| Maps integration | Google Maps Platform API | Provides address search, campus and venue map views, and interactive event location markers. |
| Email integration | SMTP provider such as SendGrid or Nodemailer-compatible SMTP | Sends booking confirmations, donation receipts, verification codes, and event reminders. |
| Chat integration | WebSocket support through Socket.IO | Enables the time-restricted event chat room for verified ticket holders. |
| Payment integration | Mock checkout for the core version; Stripe as a future option | Demonstrates paid ticket workflows without requiring real payment processing during initial development. |

## Preliminary Task Allocation
Catalin : Group Leader (Docker containerization, security compliance, environment configurations, and examiner documentation)
Masud : Frontend (Core views, Search/Filters, Primary User Actions)
Anson : Frontend (User State, Profile Dashboard, Secondary Features)
Louis : Backend (Database Architecture, Core Querying, Data Integrity)
Gaspar : Backend (Auth Security, Middleware, Auxiliary APIs)

## Anticipated Challenges:
Full-Stack Integration & Authentication Architecture Transitioning from Python to Node.js/Express, Docker, and MySQL creates a steep learning curve for frontend-backend connection, real-time WebSockets, and authentication logic (e.g., email domain verification and session management).

Plan: Standardize API contracts early, implement simple, phased iterations (e.g., start with event discussion threads before live WebSockets)

Database Schema Design & Migration Risk Designing a normalized MySQL schema for complex features (events, ticketing, fundraising) is difficult to alter once endpoints are built, risking cascading code rewrites.

Plan: Treat schema updates like production code by using ER diagrams for visual planning, peer reviews before merging, and testing DDL scripts on clean database builds.

Our group consists of members from diverse cultural backgrounds, bringing distinct communication styles, work habits, and problem-solving approaches. While aligning our workflows across time management and technical preferences requires extra effort, we leverage this diversity as a strength. By maintaining open communication, establishing clear documentation, and staying united around our common goal, delivering a fully working project.