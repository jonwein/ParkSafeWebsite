// Sign data comes in zoom-16 Web Mercator tiles (/tiles/16/{x}/{y}, about 460m square in NYC),
// so every visitor looking at the same block requests the same URL and the CDN can cache it.

import { isValidFeature, toSign, type Sign, type SignFeature } from './restrictions/sign';

export const TILE_ZOOM = 16;

/** The area the backend serves (same box as the nyc-location Lambda) */
export const NYC_BOUNDS = { west: -74.2591, south: 40.4774, east: -73.7004, north: 40.9176 };

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface Tile {
  x: number;
  y: number;
}

const n = 2 ** TILE_ZOOM;

export function tileForPoint(lng: number, lat: number): Tile {
  const latRad = (lat * Math.PI) / 180;
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n),
  };
}

export function tileBounds({ x, y }: Tile): Bounds {
  const rowTop = (row: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / n))) * 180) / Math.PI;
  return { west: (x / n) * 360 - 180, south: rowTop(y + 1), east: ((x + 1) / n) * 360 - 180, north: rowTop(y) };
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

export function isInNyc(lng: number, lat: number): boolean {
  return lng >= NYC_BOUNDS.west && lng <= NYC_BOUNDS.east && lat >= NYC_BOUNDS.south && lat <= NYC_BOUNDS.north;
}

/** Tiles covering the bounds that overlap NYC, nearest to the center first */
export function tilesFor(bounds: Bounds): Tile[] {
  const topLeft = tileForPoint(bounds.west, bounds.north);
  const bottomRight = tileForPoint(bounds.east, bounds.south);
  const center = tileForPoint((bounds.west + bounds.east) / 2, (bounds.north + bounds.south) / 2);
  const tiles: Tile[] = [];
  for (let x = topLeft.x; x <= bottomRight.x; x++) {
    for (let y = topLeft.y; y <= bottomRight.y; y++) {
      if (overlaps(tileBounds({ x, y }), NYC_BOUNDS)) tiles.push({ x, y });
    }
  }
  const distance = (t: Tile) => (t.x - center.x) ** 2 + (t.y - center.y) ** 2;
  return tiles.sort((a, b) => distance(a) - distance(b));
}

export function tileKey({ x, y }: Tile): string {
  return `${x}/${y}`;
}

/** Loaded tiles, most recently used last; requests for a tile already loading are shared */
export class TileStore {
  private tiles = new Map<string, Promise<Sign[]>>();

  constructor(private readonly limit = 150) {}

  load(tile: Tile): Promise<Sign[]> {
    const key = tileKey(tile);
    const existing = this.tiles.get(key);
    if (existing) {
      this.tiles.delete(key);
      this.tiles.set(key, existing);
      return existing;
    }

    const request = fetch(`/tiles/${TILE_ZOOM}/${key}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Sign tile ${key}: HTTP ${response.status}`);
        return response.json() as Promise<{ features?: SignFeature[] }>;
      })
      .then(({ features = [] }) =>
        features
          .filter(isValidFeature)
          .map(toSign)
          .filter((sign) => sign.properties.is_parking_relevant !== false),
      );
    // A failed tile is dropped so the next attempt retries it
    request.catch(() => this.tiles.delete(key));

    this.tiles.set(key, request);
    while (this.tiles.size > this.limit) this.tiles.delete(this.tiles.keys().next().value!);
    return request;
  }
}
