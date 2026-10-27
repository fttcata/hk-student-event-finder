import { Router } from 'express'
import { pool } from '../config/db.js'

const router = Router()

router.get('/', async (_request, response) => {
  const [categories] = await pool.query('SELECT id, name FROM categories ORDER BY name ASC')
  response.status(200).json({ categories })
})

export default router
