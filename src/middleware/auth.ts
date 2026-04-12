import { createMiddleware } from "hono/factory";

export const apiKeyAuth = createMiddleware(async (c, next) => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    await next();
    return;
  }

  const provided = c.req.header("x-api-key");
  if (provided !== apiKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});
