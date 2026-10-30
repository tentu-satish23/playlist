/**
 * Vercel serverless entry for the Express API.
 * Requests to /api/* are handled here so the static frontend and backend
 * share the same origin (no VITE_API_URL required).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../../api-server/src/app";

export const config = {
  // Jamendo fetches can take a few seconds
  maxDuration: 30,
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Express is mounted at /api; Vercel may pass the path with or without it.
  // Normalize so app.use("/api", router) still matches.
  const url = req.url ?? "/";
  if (!url.startsWith("/api")) {
    req.url = `/api${url.startsWith("/") ? url : `/${url}`}`;
  }
  return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
