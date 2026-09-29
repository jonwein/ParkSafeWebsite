// The iOS app's App Store listing

export const APP_STORE_ID = '6758868188';
export const APP_STORE_URL = 'https://apps.apple.com/us/app/parksafe-nyc-street-parking/id6758868188';
export const APP_NAME = 'ParkSafe - NYC Street Parking';

export interface AppStoreRating {
  value: number;
  count: number;
}

/** The app's App Store rating, fetched when the site is built; undefined if unavailable */
export async function fetchAppStoreRating(): Promise<AppStoreRating | undefined> {
  try {
    const response = await fetch(`https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=us`, {
      signal: AbortSignal.timeout(5000),
    });
    const app = (await response.json()).results?.[0];
    if (!app?.userRatingCount || !app.averageUserRating) return undefined;
    return { value: Math.round(app.averageUserRating * 10) / 10, count: app.userRatingCount };
  } catch {
    return undefined;
  }
}
