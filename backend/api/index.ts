/**
 * Vercel serverless entry point.
 *
 * Vercel runs the backend as a serverless function rather than a long-lived
 * `app.listen()` server, so this module exports the configured Express app as
 * the default handler. An Express application instance is itself a
 * `(req, res) => void` request handler, which is exactly what the Vercel Node
 * runtime invokes per request.
 *
 * `vercel.json` rewrites every incoming path to this function while preserving
 * the original URL, so the app's `/api/v1/*` routes match unchanged.
 *
 * Local dev is unaffected: `npm run dev` still runs `src/index.ts` via `tsx`,
 * which calls `start()` / `app.listen()` as before.
 */
import { createApp } from '../src/index.js';

const app = createApp();

export default app;
