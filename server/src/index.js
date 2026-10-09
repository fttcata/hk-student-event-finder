import cors from 'cors'
import express from 'express'
import 'dotenv/config'
import { pool } from '../config/db.js'
import helmet from 'helmet'
import authRoutes from '../routes/auth.js'

const app = express()
const port = Number(process.env.PORT || 5000)

app.use(helmet())
app.use(cors())
app.use(express.json())

app.get('/', (_request, response) => {
  response.json({ message: 'Campus Hub API is running', frontend: 'http://localhost' })
})

app.get('/api/health', (_request, response) => {
  response.status(200).json({ status: 'ok' })
})

app.use('/api/auth', authRoutes)

app.get('/api/events', async (_request, response) => {
  try {
    const [events] = await pool.query(
      `SELECT e.id, e.title, c.name AS category, e.event_date AS date, e.location
       FROM events e
       JOIN categories c ON c.id = e.category_id
       WHERE e.status = 'published'
       ORDER BY e.event_date ASC`,
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
