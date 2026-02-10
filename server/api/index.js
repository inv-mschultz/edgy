/**
 * Vercel serverless entry point.
 *
 * We do NOT use @hono/node-server/vercel's handle() because Vercel
 * pre-parses the request body, so Hono's stream-based body reader hangs.
 * Instead, we manually construct a Web API Request with the buffered body
 * and call app.fetch() directly.
 */
const { app } = require("../dist/index.js");

module.exports = async (req, res) => {
  // Build the full URL
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const url = new URL(req.url, `${protocol}://${host}`);

  // Build headers
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  // Build body — Vercel provides req.body as pre-parsed JSON or Buffer
  let body = undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (req.body !== undefined && req.body !== null) {
      body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }
  }

  // Create Web API Request
  const request = new Request(url.toString(), {
    method: req.method,
    headers,
    body,
  });

  // Call Hono app
  const response = await app.fetch(request);

  // Write status and headers
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  // Stream the response body
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      res.end();
    }
  } else {
    res.end();
  }
};
