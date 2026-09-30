/** An error with an HTTP status and a message that is safe to show to players. */
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.extra = extra;
  }
}

/** Raised when the database cannot be reached or rejects a query. */
class DatabaseError extends HttpError {
  constructor(cause) {
    super(503, 'The game database is unavailable right now. Please try again in a moment.');
    this.name = 'DatabaseError';
    this.cause = cause;
  }
}

/** Wraps an async route handler so rejected promises reach the error middleware. */
const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

module.exports = { HttpError, DatabaseError, asyncHandler };
