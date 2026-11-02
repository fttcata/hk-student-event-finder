import { pool } from '../config/db.js'

export async function listCategories() {
  const [categories] = await pool.query('SELECT id, name FROM categories ORDER BY name ASC')
  return categories
}

export async function findCategoryById(categoryId) {
  const [[category]] = await pool.query('SELECT id FROM categories WHERE id = ?', [categoryId])
  return category ?? null
}

export async function findCategoryByName(name) {
  const [[category]] = await pool.query('SELECT id FROM categories WHERE name = ?', [name])
  return category ?? null
}
