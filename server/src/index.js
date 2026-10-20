// Must stay the first import: later modules read process.env while they load.
import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { pool } from '../config/db.js'
import { errorHandler, notFound } from '../middleware/errors.js'
import authRoutes from '../routes/auth.js'
import categoryRoutes from '../routes/categories.js'
import eventRoutes from '../routes/events.js'

const app = express()
const port = Number(process.env.PORT || 5000)

app.use(helmet())
app.use(cors())
app.use(express.json())

app.get('/', (_request, response) => {
  response.json({ message: 'Campus Hub API is running', frontend: 'http://localhost' })
})

app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1')
    response.status(200).json({ status: 'ok', database: 'connected' })
  } catch {
    response.status(503).json({ status: 'error', database: 'unavailable' })
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/events', eventRoutes)
app.use('/api/categories', categoryRoutes)

app.use('/api', notFound)
app.use(errorHandler)

app.listen(port, () => {
  console.log(`API listening at http://localhost:${port}`)
})
