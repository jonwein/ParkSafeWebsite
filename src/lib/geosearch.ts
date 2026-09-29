// Address search with NYC GeoSearch (NYC Planning's geocoder; free, no key, NYC only)

export interface Place {
  label: string;
  lng: number;
  lat: number;
}

interface GeoSearchResponse {
  features?: { properties?: { label?: string }; geometry?: { coordinates?: number[] } }[];
}

export async function searchPlaces(text: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `https://geosearch.planninglabs.nyc/v2/autocomplete?text=${encodeURIComponent(text)}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`GeoSearch: HTTP ${response.status}`);
  const { features = [] } = (await response.json()) as GeoSearchResponse;
  return features.flatMap((feature) => {
    const [lng, lat] = feature.geometry?.coordinates ?? [];
    const label = feature.properties?.label?.replace(/, USA$/, '');
    return label && Number.isFinite(lng) && Number.isFinite(lat) ? [{ label, lng, lat }] : [];
  });
}

const HISTORY_KEY = 'parksafe.searchHistory';
const HISTORY_LIMIT = 8;

export function loadSearchHistory(): Place[] {
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

export function saveToSearchHistory(place: Place): Place[] {
  const history = [place, ...loadSearchHistory().filter((p) => p.label !== place.label)].slice(0, HISTORY_LIMIT);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); history just isn't kept
  }
  return history;
}
