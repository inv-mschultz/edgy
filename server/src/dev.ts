/**
 * Local development server entry point.
 * Uses @hono/node-server to run the Hono app locally.
 */

import { serve } from "@hono/node-server";
import { app } from "./index";

const port = parseInt(process.env.PORT || "3000", 10);
serve({ fetch: app.fetch, port });
console.log(`[edgy-server] Running at http://localhost:${port}`);
