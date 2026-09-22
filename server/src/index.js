import cors from 'cors'
import express from 'express'
import 'dotenv/config'
import { pool } from './db.js'

const app = express()
const port = Number(process.env.PORT || 5000)

app.use(cors())
app.use(express.json())

app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1')
    response.json({ status: 'ok', database: 'connected' })
  } catch (error) {
    response.status(503).json({ status: 'error', database: 'unavailable' })
  }
})

app.get('/api/events', async (_request, response) => {
  try {
    const [events] = await pool.query(
      'SELECT id, title, category, event_date AS date, location FROM events ORDER BY event_date ASC',
    )
    response.json({ events })
  } catch (error) {
    console.error(error)
    response.status(500).json({ error: 'Unable to load events' })
  }
})

app.listen(port, () => {
  console.log(`API listening at http://localhost:${port}`)
})
