// Dev-server stand-in for the API paths CloudFront forwards in production (/tiles/*,
// /asp-calendar). Adds the API key from .env (PARKSAFE_API_BASE_URL, PARKSAFE_API_KEY) on the
// server so it never reaches the browser.

async function upstream(env, path) {
  return fetch(env.PARKSAFE_API_BASE_URL + path, { headers: { 'x-api-key': env.PARKSAFE_API_KEY } });
}

export function devApi(env) {
  function install(server) {
    if (!env.PARKSAFE_API_BASE_URL || !env.PARKSAFE_API_KEY) {
      server.config.logger.warn('[dev-api] PARKSAFE_API_BASE_URL / PARKSAFE_API_KEY not set in .env: no sign data');
      return;
    }
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, 'http://localhost');
      const isApiPath = /^\/tiles\/16\/\d+\/\d+$/.test(url.pathname) || url.pathname === '/asp-calendar';
      if (!isApiPath) return next();

      try {
        const response = await upstream(env, url.pathname + url.search);
        res.statusCode = response.status;
        res.setHeader('Content-Type', response.headers.get('content-type') ?? 'application/json');
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        res.statusCode = 502;
        res.end(JSON.stringify({ error: String(error) }));
      }
    });
  }

  return { name: 'parksafe-dev-api', configureServer: install };
}
