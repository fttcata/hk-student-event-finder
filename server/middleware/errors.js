// Unknown /api/* paths get JSON instead of Express's default HTML page.
export function notFound(_request, response) {
  response.status(404).json({ error: 'Not found' })
}

// Express 5 forwards errors thrown in async handlers here, so routes only catch
// errors they turn into a specific response (e.g. ER_DUP_ENTRY -> 409).
export function errorHandler(error, _request, response, _next) {
  // body-parser marks client errors (malformed JSON, body too large) with a 4xx status.
  if (error.status >= 400 && error.status < 500) {
    const message = error.type === 'entity.parse.failed' ? 'Request body must be valid JSON' : error.message
    return response.status(error.status).json({ error: message })
  }

  console.error(error)
  return response.status(500).json({ error: 'Internal server error' })
}
