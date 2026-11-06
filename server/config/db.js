import pg from 'pg'

const { Pool, types } = pg

types.setTypeParser(20, Number.parseInt)
types.setTypeParser(1700, Number.parseFloat)

function expandPlaceholders(sql, values) {
  let index = 0
  const expandedValues = []
  let expandedSql = ''

  for (const character of sql) {
    if (character !== '?' || index >= values.length) {
      expandedSql += character
      continue
    }

    const value = values[index]
    index += 1
    if (Array.isArray(value)) {
      if (value.length === 0) throw new Error('SQL array parameters must not be empty')
      const placeholders = value.map((item) => {
        expandedValues.push(item)
        return `$${expandedValues.length}`
      })
      expandedSql += placeholders.join(', ')
    } else {
      expandedValues.push(value)
      expandedSql += `$${expandedValues.length}`
    }
  }

  return { sql: expandedSql, values: expandedValues }
}

class DatabaseConnection {
  constructor(client) {
    this.client = client
  }

  async query(sql, values = []) {
    return executeQuery(this.client, sql, values)
  }

  async beginTransaction() {
    await this.client.query('BEGIN')
  }

  async commit() {
    await this.client.query('COMMIT')
  }

  async rollback() {
    await this.client.query('ROLLBACK')
  }

  release() {
    this.client.release()
  }
}

async function executeQuery(client, sql, values) {
  const prepared = expandPlaceholders(sql, values)
  try {
    const result = await client.query(prepared.sql, prepared.values)
    return [
      result.rows,
      {
        affectedRows: result.rowCount,
        insertId: result.rows[0]?.id ?? null,
      },
    ]
  } catch (error) {
    if (error.code === '23505') error.code = 'ER_DUP_ENTRY'
    throw error
  }
}

class DatabasePool {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || undefined,
      host: process.env.DATABASE_URL ? undefined : process.env.DB_HOST,
      port: process.env.DATABASE_URL ? undefined : Number(process.env.DB_PORT || 5432),
      database: process.env.DATABASE_URL ? undefined : process.env.DB_NAME,
      user: process.env.DATABASE_URL ? undefined : process.env.DB_USER,
      password: process.env.DATABASE_URL ? undefined : process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: 10,
    })
  }

  query(sql, values = []) {
    return executeQuery(this.pool, sql, values)
  }

  async getConnection() {
    return new DatabaseConnection(await this.pool.connect())
  }

  end() {
    return this.pool.end()
  }
}

export const pool = new DatabasePool()
