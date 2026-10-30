import app from "./app";
import { logger } from "./lib/logger";

// On Vercel the platform invokes the Express app as a serverless handler.
// Only bind a port when running as a long-lived Node process (Replit, Railway, etc.).
if (process.env.VERCEL) {
  // Re-exported for local tooling; Vercel uses api/[...path] which imports ./app.
} else {
  const rawPort = process.env["PORT"];

  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

export default app;
