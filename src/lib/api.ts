export function getApiBaseUrl() {
  // In production, use the current origin
  if (process.env.NODE_ENV === 'production') {
    return window.location.origin;
  }
  // In development, use Vercel's development URL
  return 'http://localhost:3000';
}
