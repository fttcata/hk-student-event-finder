import 'dotenv/config'
import { pool } from '../config/db.js'

const email = process.argv[2]?.trim().toLowerCase()

try {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Provide the email address of an existing verified account.')
  }

  const [result] = await pool.query(
    `UPDATE users SET role = 'admin' WHERE email = ? AND is_verified = TRUE`,
    [email],
  )

  if (result.affectedRows !== 1) {
    const [[user]] = await pool.query('SELECT is_verified FROM users WHERE email = ?', [email])
    if (!user) throw new Error(`No account exists for ${email}. Register and verify it first.`)
    if (!user.is_verified) throw new Error(`The account for ${email} must be verified before admin promotion.`)
    console.log(`${email} already has the admin role.`)
  } else {
    console.log(`Granted admin role to ${email}. Log out and back in to refresh the role in the web app.`)
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
