export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || (err.name === 'ZodError' ? 400 : 500);
  res.status(statusCode).json({
    message: err.name === 'ZodError' ? 'Please check the highlighted fields and try again' : err.message || 'Something went wrong',
    details: process.env.NODE_ENV === 'production' ? undefined : err.issues || err.details
  });
}
