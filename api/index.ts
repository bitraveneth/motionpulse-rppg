import { handle } from 'hono/vercel'
import { app } from '../server/app.ts'

// Vercel serverless entry — the same Hono app the Vite dev server mounts.
export default handle(app)
