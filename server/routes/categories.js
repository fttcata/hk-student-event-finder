import { Router } from 'express'
import { listCategories } from '../queries/categories.js'

const router = Router()

router.get('/', async (_request, response) => {
  const categories = await listCategories()
  response.status(200).json({ categories })
})

export default router
