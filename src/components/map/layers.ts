// MapLibre source and layers for sign pins. Re-added whenever the basemap style loads
// (a style change drops them).

import type { FeatureCollection } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { PinColor } from '../../lib/restrictions/calculator';

export const POLE_SOURCE = 'poles';
export const POLE_LAYERS = ['poles', 'pole-labels'];

// The iOS app's system colors
export const PIN_COLORS: Record<PinColor, string> = {
  red: '#ff3b30',
  orange: '#ff9500',
  green: '#34c759',
  gray: '#8e8e93',
};

const colorExpression = [
  'match',
  ['get', 'color'],
  'red',
  PIN_COLORS.red,
  'orange',
  PIN_COLORS.orange,
  'green',
  PIN_COLORS.green,
  PIN_COLORS.gray,
] as const;

export function lightOrDarkStyle(dark: boolean): string {
  return `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'positron'}`;
}

/** A rounded pill in each pin color, stretched behind the duration labels */
function addPillImages(map: MapLibreMap) {
  const ratio = 2;
  const size = 36;
  const radius = 17;
  for (const [name, color] of Object.entries(PIN_COLORS)) {
    const id = `pill-${name}`;
    if (map.hasImage(id)) continue;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d')!;
    context.fillStyle = color;
    context.beginPath();
    context.roundRect(0.5, 0.5, size - 1, size - 1, radius);
    context.fill();
    map.addImage(id, context.getImageData(0, 0, size, size), {
      pixelRatio: ratio,
      stretchX: [[radius, size - radius]],
      stretchY: [[radius, size - radius]],
      content: [radius - 6, 8, size - radius + 6, size - 8],
    });
  }
}

export function addPoleLayers(map: MapLibreMap, data: FeatureCollection, dark: boolean) {
  addPillImages(map);
  map.addSource(POLE_SOURCE, { type: 'geojson', data });

  map.addLayer({
    id: 'pole-selected',
    type: 'circle',
    source: POLE_SOURCE,
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 9, 17, 13, 19, 18],
      'circle-color': colorExpression as never,
      'circle-opacity': 0.3,
      'circle-stroke-width': 2,
      'circle-stroke-color': colorExpression as never,
    },
  });

  map.addLayer({
    id: 'poles',
    type: 'circle',
    source: POLE_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 3.5, 17, 6, 19, 9],
      'circle-color': colorExpression as never,
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 15, 1, 17, 1.5],
      'circle-stroke-color': dark ? '#0f1115' : '#ffffff',
    },
  });

  map.addLayer({
    id: 'pole-labels',
    type: 'symbol',
    source: POLE_SOURCE,
    minzoom: 17.5,
    filter: ['!=', ['get', 'label'], ''],
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 11,
      'text-anchor': 'top',
      'text-offset': [0, 0.9],
      'icon-image': ['concat', 'pill-', ['get', 'color']],
      'icon-text-fit': 'both',
      'icon-text-fit-padding': [1, 5, 1, 5],
      'icon-anchor': 'top',
      'icon-offset': [0, 0],
    },
    paint: {
      'text-color': '#ffffff',
    },
  });
}

export function setSelectedPole(map: MapLibreMap, id: string | undefined) {
  if (map.getLayer('pole-selected')) map.setFilter('pole-selected', ['==', ['get', 'id'], id ?? '']);
}
