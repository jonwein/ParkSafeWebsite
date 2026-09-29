import { GeolocateControl, Map as MapLibreMap, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre loads its worker from a file beside its own module, which bundling moves; Vite
// builds the worker (with the code it shares with the main thread) as its own chunk instead
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { loadAspCalendar } from '../../lib/aspClient';
import type { Place } from '../../lib/geosearch';
import type { AspCalendar } from '../../lib/restrictions/asp';
import { nycDateKey } from '../../lib/restrictions/nycTime';
import type { FeatureCollection, Point } from 'geojson';
import type { Sign } from '../../lib/restrictions/sign';
import { isInNyc, NYC_BOUNDS, tileKey, tilesFor, TileStore, type Bounds } from '../../lib/tiles';
import { AspBanner } from './AspBanner';
import { FilterPanel } from './FilterPanel';
import { activeFilterCount, readFilters, toSignFilters, writeFilters, type FilterState } from './filterState';
import { addPoleLayers, lightOrDarkStyle, PIN_COLORS, POLE_LAYERS, POLE_SOURCE, setSelectedPole } from './layers';
import { PoleDetails } from './PoleDetails';
import { buildPoles, polesToGeoJSON } from './poles';
import { SearchBox } from './SearchBox';

setWorkerUrl(mapWorkerUrl);

/** Below this zoom there are too many tiles to load; the map asks to zoom in */
const SIGN_MIN_ZOOM = 15;
const MIDTOWN: [number, number] = [-73.9855, 40.758];

type Area = 'signs' | 'zoomOut' | 'outside';
type LocationNote = 'outside' | 'denied' | 'unavailable';

const LOCATION_NOTES: Record<LocationNote, string> = {
  outside: 'Your location is outside New York City, which is all ParkSafe covers.',
  denied: 'Location is turned off for this site. Allow it in your browser settings, or search an address.',
  unavailable: "Couldn't find your location. Try again, or search an address.",
};

/** Whether the browser will share location without asking ('granted'), would ask ('prompt'), or won't */
async function locationPermission(): Promise<PermissionState> {
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state;
  } catch {
    return 'prompt';
  }
}

function boundsOverlapNyc(b: Bounds): boolean {
  return b.west <= NYC_BOUNDS.east && b.east >= NYC_BOUNDS.west && b.south <= NYC_BOUNDS.north && b.north >= NYC_BOUNDS.south;
}

export default function MapApp() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap>();
  const store = useRef(new TileStore());
  const loadedTiles = useRef(new Map<string, Sign[]>());
  const geojson = useRef<FeatureCollection>(polesToGeoJSON([]));
  const selectedRef = useRef<string>();

  const [visibleTiles, setVisibleTiles] = useState<string[]>([]);
  const [tilesVersion, setTilesVersion] = useState(0);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(false);
  const [area, setArea] = useState<Area>('signs');
  const [calendar, setCalendar] = useState<AspCalendar>(new Map());
  const [filters, setFilters] = useState<FilterState>(() => readFilters(location.search));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  const geolocateRef = useRef<GeolocateControl>();
  const [offerLocation, setOfferLocation] = useState(false);
  const [locationNote, setLocationNote] = useState<LocationNote>();

  useEffect(() => {
    if (!locationNote) return;
    const timer = setTimeout(() => setLocationNote(undefined), 6000);
    return () => clearTimeout(timer);
  }, [locationNote]);

  // Statuses change by the minute
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    loadAspCalendar().then(setCalendar, () => undefined);
  }, []);

  useEffect(() => {
    history.replaceState(history.state, '', writeFilters(filters, location.search) + location.hash);
  }, [filters]);

  const refresh = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const bounds = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };

    if (!boundsOverlapNyc(bounds)) {
      setArea('outside');
      setVisibleTiles([]);
      return;
    }
    if (map.getZoom() < SIGN_MIN_ZOOM) {
      setArea('zoomOut');
      setVisibleTiles([]);
      return;
    }
    setArea('signs');

    const tiles = tilesFor(bounds);
    setVisibleTiles(tiles.map(tileKey));
    const missing = tiles.filter((tile) => !loadedTiles.current.has(tileKey(tile)));
    if (!missing.length) return;

    setFailed(false);
    setPending((n) => n + missing.length);
    for (const tile of missing) {
      store.current
        .load(tile)
        .then(
          (signs) => {
            loadedTiles.current.set(tileKey(tile), signs);
            if (loadedTiles.current.size > 150) loadedTiles.current.delete(loadedTiles.current.keys().next().value!);
            setTilesVersion((v) => v + 1);
          },
          () => setFailed(true),
        )
        .finally(() => setPending((n) => n - 1));
    }
  }, []);

  // Map setup
  useEffect(() => {
    // A link to a place (#at=zoom/lat/lng) opens there; otherwise the map starts where you are
    const openedAtPlace = /(^#|&)at=/.test(location.hash);
    const darkQuery = matchMedia('(prefers-color-scheme: dark)');
    const map = new MapLibreMap({
      container: container.current!,
      style: lightOrDarkStyle(darkQuery.matches),
      center: MIDTOWN,
      zoom: 16.5,
      minZoom: 9,
      maxBounds: [
        [-74.8, 40.2],
        [-73.2, 41.2],
      ],
      hash: 'at',
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // Lets the dev-only browser checks find pins
    if (import.meta.env.DEV) Object.assign(window, { __parksafeMap: map });
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    const geolocate = new GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      // The dot follows you, for walking back to the car
      trackUserLocation: true,
      fitBoundsOptions: { maxZoom: 17 },
    });
    geolocateRef.current = geolocate;
    map.addControl(geolocate, 'bottom-right');
    // Outside NYC there are no signs to show: stop following and stay on the city
    const outsideNyc = () => {
      setLocationNote('outside');
      setTimeout(() => {
        geolocate.trigger();
        map.jumpTo({ center: MIDTOWN, zoom: 16.5 });
      });
    };
    geolocate.on('geolocate', ({ coords }) => {
      setOfferLocation(false);
      if (!isInNyc(coords.longitude, coords.latitude)) outsideNyc();
    });
    // Beyond the map's bounds the camera doesn't move at all
    geolocate.on('outofmaxbounds', () => {
      setOfferLocation(false);
      outsideNyc();
    });
    geolocate.on('error', ({ code }) => {
      setOfferLocation(false);
      setLocationNote(code === GeolocationPositionError.PERMISSION_DENIED ? 'denied' : 'unavailable');
    });
    map.on('load', () => {
      if (openedAtPlace) return;
      locationPermission().then((state) => {
        if (state === 'granted') geolocate.trigger();
        else if (state === 'prompt') setOfferLocation(true);
      });
    });

    map.on('style.load', () => {
      addPoleLayers(map, geojson.current, darkQuery.matches);
      setSelectedPole(map, selectedRef.current);
    });
    map.on('load', refresh);
    map.on('moveend', refresh);

    // Generous hit area for fingers: the nearest pin within 16px of the tap
    map.on('click', (event) => {
      const { x, y } = event.point;
      const hits = map.queryRenderedFeatures(
        [
          [x - 16, y - 16],
          [x + 16, y + 16],
        ],
        { layers: POLE_LAYERS },
      );
      const nearest = hits
        .map((feature) => {
          const coordinates = (feature.geometry as Point).coordinates as [number, number];
          const p = map.project(coordinates);
          return { id: String(feature.properties.id), coordinates, distance: (p.x - x) ** 2 + (p.y - y) ** 2 };
        })
        .sort((a, b) => a.distance - b.distance)[0];
      setSelectedId(nearest?.id);
      if (!nearest) return;
      setFiltersOpen(false);
      // On phones the details sheet covers the lower half: keep the pin in view above it
      if (!matchMedia('(min-width: 768px)').matches && y > window.innerHeight * 0.4) {
        map.easeTo({ center: nearest.coordinates, offset: [0, -window.innerHeight * 0.25], duration: 300 });
      }
    });
    for (const layer of POLE_LAYERS) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
    }

    const onScheme = () => map.setStyle(lightOrDarkStyle(darkQuery.matches));
    darkQuery.addEventListener('change', onScheme);
    return () => {
      darkQuery.removeEventListener('change', onScheme);
      map.remove();
    };
  }, [refresh]);

  const visibleSigns = useMemo(() => {
    const byId = new Map<string, Sign>();
    for (const key of visibleTiles) {
      for (const sign of loadedTiles.current.get(key) ?? []) byId.set(sign.id, sign);
    }
    return byId;
  }, [visibleTiles, tilesVersion]);

  const signFilters = useMemo(() => toSignFilters(filters), [filters]);
  const poles = useMemo(
    () => buildPoles(visibleSigns.values(), signFilters, now, calendar),
    [visibleSigns, signFilters, now, calendar],
  );

  useEffect(() => {
    geojson.current = polesToGeoJSON(poles);
    (mapRef.current?.getSource(POLE_SOURCE) as GeoJSONSource | undefined)?.setData(geojson.current);
  }, [poles]);

  const selected = selectedId ? poles.find((pole) => pole.id === selectedId) : undefined;
  useEffect(() => {
    selectedRef.current = selected?.id;
    if (mapRef.current) setSelectedPole(mapRef.current, selected?.id);
  }, [selected?.id]);

  const flyTo = (place: Place) => {
    setSelectedId(undefined);
    mapRef.current?.flyTo({ center: [place.lng, place.lat], zoom: 17.5 });
  };

  let message: preact.ComponentChild = null;
  if (area === 'outside') {
    message = (
      <>
        ParkSafe covers New York City.{' '}
        <button type="button" class="link-button" onClick={() => flyTo({ label: 'Midtown', lng: MIDTOWN[0], lat: MIDTOWN[1] })}>
          Go to Midtown
        </button>
      </>
    );
  } else if (area === 'zoomOut') {
    message = 'Zoom in to see parking signs';
  } else if (failed) {
    message = (
      <>
        Couldn't load some signs.{' '}
        <button type="button" class="link-button" onClick={refresh}>
          Retry
        </button>
      </>
    );
  } else if (pending > 0 && !poles.length) {
    message = 'Loading signs…';
  } else if (visibleSigns.size > 0 && !poles.length) {
    message = 'No signs match your filters';
  }

  const filterCount = activeFilterCount(filters);
  const sheetOpen = Boolean(selected) || filtersOpen;
  const aspToday = calendar.get(nycDateKey(now));

  return (
    <div class="map-app">
      <div class="map-canvas" ref={container} />
      <aside class="map-side">
        <div class="map-toolbar">
          <a class="map-brand" href="/" aria-label="ParkSafe home">
            <img src="/favicon.svg" alt="" width="28" height="28" />
            <span>ParkSafe</span>
          </a>
          <SearchBox onSelect={flyTo} />
          <button
            type="button"
            class="filter-button"
            aria-expanded={filtersOpen}
            onClick={() => {
              setFiltersOpen(!filtersOpen);
              setSelectedId(undefined);
            }}
          >
            Filters{filterCount ? ` (${filterCount})` : ''}
          </button>
        </div>
        <AspBanner calendar={calendar} now={now} />
        <div class="map-sheet" data-open={sheetOpen || undefined}>
          {selected ? (
            <PoleDetails pole={selected} aspToday={aspToday} onClose={() => setSelectedId(undefined)} />
          ) : filtersOpen ? (
            <FilterPanel filters={filters} onChange={setFilters} onClose={() => setFiltersOpen(false)} />
          ) : (
            <Intro />
          )}
        </div>
      </aside>
      {offerLocation && !sheetOpen ? (
        <button
          type="button"
          class="locate-offer"
          onClick={() => {
            setOfferLocation(false);
            geolocateRef.current?.trigger();
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="currentColor" d="M21 3 3 10.5l7.2 2.3L12.5 20z" />
          </svg>
          Show my location
        </button>
      ) : null}
      {locationNote ? (
        <div class="map-message" role="status">
          {LOCATION_NOTES[locationNote]}
        </div>
      ) : message ? (
        <div class="map-message" role="status">
          {message}
        </div>
      ) : pending > 0 ? (
        <div class="map-message map-message-quiet" role="status">
          Loading signs…
        </div>
      ) : null}
    </div>
  );
}

function Intro() {
  return (
    <section class="intro">
      <h1>NYC parking signs</h1>
      <p class="muted">Tap a pin to read its signs. Pins show when parking there is next restricted.</p>
      <ul class="legend">
        <li>
          <span class="dot" style={{ background: PIN_COLORS.red }} /> Restricted now
        </li>
        <li>
          <span class="dot" style={{ background: PIN_COLORS.orange }} /> Restriction within 24 hours
        </li>
        <li>
          <span class="dot" style={{ background: PIN_COLORS.green }} /> Clear for 24 hours or more
        </li>
        <li>
          <span class="dot" style={{ background: PIN_COLORS.gray }} /> Read the sign
        </li>
      </ul>
      <p class="fine-print">
        Always read the posted signs. Sign data from NYC DOT, updated daily. Street cleaning is shown as clear on days
        alternate side parking is suspended.
      </p>
    </section>
  );
}
