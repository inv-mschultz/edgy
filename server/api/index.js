// Vercel serverless entry — loads compiled Hono app
const app = require("../dist/index.js");
module.exports = app.default || app;
