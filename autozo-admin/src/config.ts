// Same live backend the Autozo app uses. Override with NEXT_PUBLIC_API_URL.
export const API_URL: string =
  process.env.NEXT_PUBLIC_API_URL ?? 'https://bingoor-backend.onrender.com/api/v1';