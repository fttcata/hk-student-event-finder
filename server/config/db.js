import mysql from 'mysql2/promise'

// Every DATETIME/TIMESTAMP is stored and returned in UTC; the API sends ISO-8601 'Z' strings
// and the client converts to the viewer's local time.
export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
  // DECIMAL columns and SUM() come back as JS numbers instead of strings.
  decimalNumbers: true,
})

// Pin the session time zone too, so NOW()/CURRENT_TIMESTAMP agree with the 'Z' above
// even when the MySQL server runs in a different zone.
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'")
})
