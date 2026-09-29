// Dev-server stand-in for the API paths CloudFront forwards in production (/tiles/*,
// /asp-calendar). Adds the API key from .env (PARKSAFE_API_BASE_URL, PARKSAFE_API_KEY) on the
// server so it never reaches the browser.
//
// Until the backend has its /tiles route, a tile is assembled from nine /location requests
// across it (each returns signs within 150m of a point).

const TILE_ZOOM = 16;

function tileBounds(x, y) {
  const n = 2 ** TILE_ZOOM;
  const rowTop = (row) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / n))) * 180) / Math.PI;
  return { west: (x / n) * 360 - 180, south: rowTop(y + 1), east: ((x + 1) / n) * 360 - 180, north: rowTop(y) };
}

async function upstream(env, path) {
  return fetch(env.PARKSAFE_API_BASE_URL + path, { headers: { 'x-api-key': env.PARKSAFE_API_KEY } });
}

async function tileFromLocationQueries(env, x, y) {
  const b = tileBounds(x, y);
  const centers = [];
  for (const fy of [1 / 6, 3 / 6, 5 / 6]) {
    for (const fx of [1 / 6, 3 / 6, 5 / 6]) {
      centers.push([b.south + (b.north - b.south) * fy, b.west + (b.east - b.west) * fx]);
    }
  }
  const responses = await Promise.all(
    centers.map(([lat, lng]) => upstream(env, `/location?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}`)),
  );
  const features = new Map();
  for (const response of responses) {
    if (!response.ok) throw new Error(`/location: HTTP ${response.status}`);
    for (const feature of (await response.json()).features ?? []) {
      const [lng, lat] = feature.geometry.coordinates;
      if (lng >= b.west && lng < b.east && lat >= b.south && lat < b.north) {
        features.set(JSON.stringify(feature), feature);
      }
    }
  }
  return { type: 'FeatureCollection', features: [...features.values()] };
}

export function devApi(env) {
  function install(server) {
    if (!env.PARKSAFE_API_BASE_URL || !env.PARKSAFE_API_KEY) {
      server.config.logger.warn('[dev-api] PARKSAFE_API_BASE_URL / PARKSAFE_API_KEY not set in .env: no sign data');
      return;
    }
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, 'http://localhost');
      const tile = /^\/tiles\/16\/(\d+)\/(\d+)$/.exec(url.pathname);
      if (!tile && url.pathname !== '/asp-calendar') return next();

      try {
        const response = await upstream(env, url.pathname + url.search);
        // API Gateway answers 403 for a route it doesn't have yet
        if (tile && response.status === 403) {
          const collection = await tileFromLocationQueries(env, Number(tile[1]), Number(tile[2]));
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('X-Dev-Api', 'assembled from /location');
          res.end(JSON.stringify(collection));
          return;
        }
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
