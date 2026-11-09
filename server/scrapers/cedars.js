import * as cheerio from 'cheerio'

// Fetches and parses events from HKU SOConnect. Nothing here touches the database, so when the
// website changes only this file needs fixing, and a dry run can show exactly what was understood.
const EVENTS_URL = 'https://soconnect.cedars.hku.hk/events'
const USER_AGENT = 'CampusHubEventFinder/1.0 (HKU student project)'

// One request at a time with a pause in between, so the scraper stays gentle on their server.
const REQUEST_DELAY_MS = 500
const REQUEST_TIMEOUT_MS = 20000

const HONG_KONG_UTC_OFFSET_HOURS = 8
const HOUR_MS = 60 * 60 * 1000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DATE_PATTERN = /(\d{1,2}) ([A-Z][a-z]{2}), (\d{4})/g
const TIME_PATTERN = /\d{1,2}:\d{2}/g
const MAX_FEE = 10000

// First match wins, tested against the event's tags, title and society. The site's "Recruitment" tag means a
// society recruiting committee members and "Welfare" means member perks, so neither implies a category.
const CATEGORY_RULES = [
  ['Career', /\b(career|careers|job|jobs|internship|mentorship|campus recruitment)\b/i],
  ['Sports', /\b(sports?|archery|fencing|taekwondo|baseball|softball|football|basketball|badminton|tennis|swimming|yoga|tai chi|martial arts)\b/i],
  ['Technology', /\b(technology|tech|coding|programming|hackathon|robotics|data science)\b/i],
  ['Charity', /\b(charity|volunteers?|volunteering|fundraising|fundraiser|donation)\b/i],
]
const DEFAULT_CATEGORY = 'Social'

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function request(url, headers = {}) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, ...headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response
}

async function fetchEventsApi(params) {
  const response = await request(`${EVENTS_URL}/api?${new URLSearchParams(params)}`, {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  })
  await sleep(REQUEST_DELAY_MS)
  return response.json()
}

// The default list includes running multi-day events but leaves out some upcoming ones, while the
// calendar's per-date lists are complete but only cover start dates. Together they catch everything.
async function fetchListedEvents(now) {
  const { events, facets } = await fetchEventsApi({ sort: 'recent' })
  const today = new Date(now.getTime() + HONG_KONG_UTC_OFFSET_HOURS * HOUR_MS).toISOString().slice(0, 10)
  const upcomingDates = facets.dates.map(({ date }) => date).filter((date) => date >= today)

  const listed = new Map(events.map((event) => [event.id, event]))
  for (const date of upcomingDates) {
    const { events: eventsOnDate } = await fetchEventsApi({ sort: 'recent', date })
    for (const event of eventsOnDate) listed.set(event.id, event)
  }
  // Other types (orientation activities) have their own pages and id sequence.
  return [...listed.values()].filter((event) => event.type === 'event')
}

// The site shows Hong Kong time, while the database stores UTC.
function hongKongTimeToUtc([, day, month, year], time) {
  const monthIndex = MONTHS.indexOf(month)
  if (monthIndex === -1) return null
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(Date.UTC(Number(year), monthIndex, Number(day), hours - HONG_KONG_UTC_OFFSET_HOURS, minutes))
}

// "07 Nov, 2026" or "04 Nov, 2026 – 15 Nov, 2026", with "13:00 – 19:30". Returns null without a date.
export function parseSchedule(dateText, timeText) {
  const dates = [...dateText.matchAll(DATE_PATTERN)]
  if (dates.length === 0) return null
  const [startTime = '00:00', endTime = '23:59'] = timeText.match(TIME_PATTERN) ?? []

  const startsAt = hongKongTimeToUtc(dates[0], startTime)
  const endsAt = hongKongTimeToUtc(dates.at(-1), endTime)
  if (!startsAt || !endsAt) return null
  // Times like "07:00 – 00:00" on a single day would otherwise end before they start.
  return { startsAt, endsAt: endsAt < startsAt ? startsAt : endsAt }
}

// "02 Nov, 2026 23:59", or something like "TBA" which has no deadline to store.
function parseDeadline(text) {
  const [date] = text.matchAll(DATE_PATTERN)
  const [time = '23:59'] = text.match(TIME_PATTERN) ?? []
  return date ? hongKongTimeToUtc(date, time) : null
}

// Fees are free text: "Free", "80", "50-60", "Member: Free | Non-member: $80". Stores the highest
// amount, so an event that some students pay for never counts as free in the ?price= filter.
// Larger numbers are not fees (a phone number, say) and could overflow the price column.
export function parseHighestFee(text) {
  const amounts = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((amount) => amount <= MAX_FEE)
  return amounts.length ? Math.max(...amounts) : 0
}

export function pickCategory(tags, title, society) {
  const text = [...tags, title, society].join(' ')
  const rule = CATEGORY_RULES.find(([, pattern]) => pattern.test(text))
  return rule ? rule[0] : DEFAULT_CATEGORY
}

// .text() alone would run lines together, so line breaks are made explicit first.
function readBlockText(block) {
  block.find('br').replaceWith('\n')
  block.find('p, li').append('\n')
  return block
    .text()
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Parses an event page. Society contact details are left out on purpose: they are often personal
// emails and phone numbers, and students can find them through the link to the original page.
export function parseEventPage(html) {
  const $ = cheerio.load(html)

  const fields = new Map()
  $('.event-detail-info').each((_index, element) => {
    const label = $(element).find('.event-detail-info-title').text().trim()
    fields.set(label, $(element).find('.event-detail-info-content-col'))
  })
  const readField = (label) => fields.get(label)?.text().replace(/\s+/g, ' ').trim() ?? ''

  const schedule = parseSchedule(readField('Date'), readField('Time'))
  if (!schedule) return null

  // The English and Chinese descriptions are the only plain <div>s directly inside these containers.
  const description = $('.event-detail-container > div:not([class])')
    .map((_index, element) => readBlockText($(element)))
    .get()
    .filter((text) => text.length > 1)
    .join('\n\n')

  const venue = fields.get('Venue')
  return {
    ...schedule,
    description: description || null,
    venue: venue?.children().first().text().trim() ?? '',
    campus: venue?.children().eq(1).text().trim() || null,
    feeText: readField('Fee') || null,
    price: parseHighestFee(readField('Fee')),
    registrationDeadline: parseDeadline(readField('Registration Deadline')),
  }
}

// Some societies post an event twice. The newest post is kept, as it is the one they last worked on.
function keepNewestDuplicates(events) {
  const newest = new Map()
  for (const event of events) {
    const key = [event.title, event.startsAt.toISOString(), event.society].join('|')
    if (!newest.has(key) || newest.get(key).sourceId < event.sourceId) newest.set(key, event)
  }
  return [...newest.values()]
}

function isCurrentOrFutureEvent(eventDate, now) {
  return eventDate >= now
}

// Returns current/future events, plus listedIds for accepted events and pages that failed to load
// so a temporary error does not look like a removed event.
export async function scrapeCedarsEvents(now = new Date()) {
  const listed = await fetchListedEvents(now)
  if (listed.length === 0) throw new Error('The website listed no events, so its format has probably changed')

  const parsed = []
  const failedIds = []
  for (const item of listed) {
    try {
      const response = await request(item.detail_url)
      const page = parseEventPage(await response.text())
      if (!page) throw new Error('no date found on the page')
      if (isCurrentOrFutureEvent(page.startsAt, now)) {
        parsed.push({
          ...page,
          sourceId: item.id,
          title: item.title || item.title_tc,
          sourceUrl: item.detail_url,
          imageUrl: item.image_url || null,
          society: item.society_name || null,
          category: pickCategory(item.tags, item.title, item.society_name),
        })
      }
    } catch (error) {
      failedIds.push(item.id)
      console.error(`Skipped ${item.detail_url}: ${error.message}`)
    }
    await sleep(REQUEST_DELAY_MS)
  }
  if (parsed.length === 0 && failedIds.length > 0) {
    throw new Error('No event page could be read, so the website format has probably changed')
  }

  const events = keepNewestDuplicates(parsed)
  const duplicateIds = new Set(parsed.map((event) => event.sourceId))
  for (const event of events) duplicateIds.delete(event.sourceId)
  const listedIds = [...parsed.map((event) => event.sourceId), ...failedIds].filter((id) => !duplicateIds.has(id))

  return { events, listedIds, failedCount: failedIds.length }
}
