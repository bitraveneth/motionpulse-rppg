import { handle } from 'hono/vercel'
import { app } from './app'

// Bundled by `npm run build:api` into api/index.js for Vercel.
export default handle(app)
