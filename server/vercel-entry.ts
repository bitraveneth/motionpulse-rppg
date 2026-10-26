import { handle } from 'hono/vercel'
import { app } from './app'

// Bundled by `npm run build:api` into api/index.js for Vercel.
// Vercel's Node runtime treats a default export as the classic (req, res)
// handler; named HTTP methods get the Web fetch-style API Hono expects.
const handler = handle(app)

export const GET = handler
export const HEAD = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const OPTIONS = handler
