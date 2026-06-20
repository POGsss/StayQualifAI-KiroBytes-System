import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
  type Router,
} from 'express';
import { pathToFileURL } from 'node:url';

import { errorHandler } from './middleware/error.js';
import { createInterviewRouter } from './routes/interview.js';
import { createResumeRouter } from './routes/resume.js';
import { NotFoundError } from './utils/errors.js';

/**
 * Base path prefix for all versioned API routes (steering: `/api/v1/` prefix).
 */
export const API_V1_PREFIX = '/api/v1';

/**
 * Builds the base v1 router. Business routes (e.g. `/resume/*`) are mounted
 * onto this router in later tasks; for now it only exposes a health check.
 */
export function createApiRouter(): Router {
  const router: Router = express.Router();

  router.get('/health', (_req: Request, res: Response): void => {
    res.status(200).json({
      data: { status: 'ok' },
      error: null,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  // Resume module routes — final paths: `/api/v1/resume/*`.
  router.use('/resume', createResumeRouter());

  // Interview module routes — final paths: `/api/v1/interview/*`.
  router.use('/interview', createInterviewRouter());

  return router;
}

/**
 * Constructs and configures the Express application: JSON body parsing,
 * the mounted v1 router, a not-found handler, and a fallback error handler
 * that emits the standard `{ data, error, meta }` envelope.
 *
 * Returned (rather than started) so tests can exercise the app directly.
 */
export function createApp(): Express {
  const app: Express = express();

  // JSON body parsing for all incoming requests.
  app.use(express.json());

  // Mount the versioned API router.
  app.use(API_V1_PREFIX, createApiRouter());

  // Not-found handler — forwards a typed error to the centralized middleware
  // so the response envelope (including `meta`) stays consistent.
  app.use((_req: Request, _res: Response, next: NextFunction): void => {
    next(new NotFoundError('Resource not found'));
  });

  // Centralized typed-error middleware. Registered last so it catches errors
  // from every route and emits the standard `{ data, error, meta }` envelope.
  app.use(errorHandler);

  return app;
}

/**
 * Starts the HTTP server on the configured port. Invoked only when this module
 * is run directly (not when imported by tests).
 */
export function start(): void {
  const port: number = Number(process.env.PORT ?? 3000);
  const app: Express = createApp();
  app.listen(port, (): void => {
    console.log(`StayQualifAI backend listening on http://localhost:${port}`);
  });
}

// Run the server when executed directly via `node`/`tsx`.
const entryPath: string | undefined = process.argv[1];
const isDirectRun: boolean =
  typeof entryPath === 'string' && import.meta.url === pathToFileURL(entryPath).href;
if (isDirectRun) {
  start();
}
