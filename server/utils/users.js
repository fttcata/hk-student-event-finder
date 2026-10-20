// Columns needed to build the user object returned by register, login, /me and req.user.
export const USER_COLUMNS = 'id, name, email, role, student_id, university, is_verified'

// The one shape the API uses for "the signed-in user" — never includes password_hash or verification_code.
export function serializeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    student_id: row.student_id ?? null,
    university: row.university ?? null,
    is_verified: Boolean(row.is_verified),
  }
}
