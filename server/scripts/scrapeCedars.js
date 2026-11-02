// Must stay the first import: later modules read process.env while they load.
import 'dotenv/config'
import { pool } from '../config/db.js'
import { findCategoryByName } from '../queries/categories.js'
import { cancelMissingScrapedEvents, upsertScrapedEvent } from '../queries/events.js'
import { findUsersByEmails } from '../queries/users.js'
import { scrapeCedarsEvents } from '../scrapers/cedars.js'

// Usage: npm run scrape:cedars            saves to the database
//        npm run scrape:cedars -- --dry-run   only prints what was scraped
const SOURCE = 'cedars'
const SYSTEM_USER_EMAIL = 'cedars-scraper@campushub.local'
const TBC_LOCATION = 'TBC'
const DRY_RUN = process.argv.includes('--dry-run')

function printEvent(event) {
  console.log(`\n${event.title}`)
  console.log(`  ${event.startsAt.toISOString()} to ${event.endsAt.toISOString()} (UTC)`)
  console.log(`  ${event.venue} | ${event.campus} | ${event.category} | fee: ${event.feeText}`)
  console.log(`  ${event.society}`)
  console.log(`  ${event.sourceUrl}`)
}

// Lengths match the events columns. The site leaves venues as "/" or empty for some online events.
function toEventRow(event, organizerId, categoryId) {
  return {
    source: SOURCE,
    source_id: String(event.sourceId),
    source_url: event.sourceUrl,
    source_organizer: event.society?.slice(0, 200) ?? null,
    title: event.title.slice(0, 150),
    description: event.description,
    category_id: categoryId,
    organizer_id: organizerId,
    location: (/\w/.test(event.venue) ? event.venue : TBC_LOCATION).slice(0, 150),
    address: event.campus?.slice(0, 200) ?? null,
    event_date: event.startsAt,
    end_date: event.endsAt,
    registration_deadline: event.registrationDeadline,
    price: event.price,
    fee_text: event.feeText?.slice(0, 150) ?? null,
    image_url: event.imageUrl?.length <= 500 ? event.imageUrl : null,
    status: 'published',
  }
}

async function main() {
  const { events, listedIds, failedCount } = await scrapeCedarsEvents()

  if (DRY_RUN) {
    events.forEach(printEvent)
    console.log(`\nDry run: ${events.length} events found, ${failedCount} pages failed, nothing saved.`)
    return
  }

  const [organizer] = await findUsersByEmails(pool, [SYSTEM_USER_EMAIL])
  if (!organizer) {
    throw new Error(`${SYSTEM_USER_EMAIL} is missing. Recreate the database so init.sql seeds it.`)
  }

  for (const event of events) {
    const category = await findCategoryByName(event.category)
    if (!category) throw new Error(`Category ${event.category} is missing from the database`)
    await upsertScrapedEvent(toEventRow(event, organizer.id, category.id))
  }
  const removed = await cancelMissingScrapedEvents(SOURCE, listedIds.map(String))

  console.log(`Saved ${events.length} events, cancelled ${removed} removed from the website, ${failedCount} pages failed.`)
}

try {
  await main()
} catch (error) {
  console.error(`Scrape failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
