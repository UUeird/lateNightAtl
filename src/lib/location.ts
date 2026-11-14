/** Location helpers shared by the home page's "Near me" and the place page's map. */

export const formatMiles = (mi: number) => (mi < 0.1 ? '< 0.1 mi' : `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`);

/** Where to turn location on, for the visitor's device. */
function locationSettingsHint(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'On iPhone: Settings → Privacy & Security → Location Services → turn it on, and set your browser to “While Using”.';
  if (/Android/.test(ua)) return 'On Android: turn on Location in Quick Settings, and allow it for your browser.';
  if (/Mac/.test(ua)) return 'On a Mac: System Settings → Privacy & Security → Location Services → turn it on for your browser, then restart the browser.';
  if (/Windows/.test(ua)) return 'On Windows: Settings → Privacy & security → Location → turn it on, and allow apps to use it.';
  return 'Check that location is turned on for your browser in your device settings.';
}

/** Where to allow location for the site, when the browser refused without asking. */
function locationDeniedHint(): string {
  // Safari on iPhone never prompts when its Location setting is Deny; it just refuses.
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    return 'On iPhone: Settings → Apps → Safari → Location → choose “Ask” or “Allow”, then try again.';
  }
  return 'To use Near me, allow location for this site in your browser’s site settings, then try again.';
}

export function locationErrorMessage(code: number): string {
  if (code === 1) return `Location is blocked for this site. ${locationDeniedHint()}`;
  if (code === 3) return 'Finding your location took too long. Try again, ideally with Wi-Fi on.';
  return `Your device couldn’t find your location. ${locationSettingsHint()}`;
}

/**
 * Whether the visitor has already allowed location for this site, so it can be shown
 * without a prompt. False when unknown (no Permissions API) or not yet decided.
 */
export async function locationAlreadyAllowed(): Promise<boolean> {
  try {
    return (await navigator.permissions?.query({ name: 'geolocation' }))?.state === 'granted';
  } catch {
    return false;
  }
}

/** Ask for the visitor's position (prompting if needed). */
export const getPosition = () =>
  new Promise<GeolocationPosition>((ok, fail) =>
    navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 }),
  );

/** Location needs https and a browser that supports it. */
export const locationAvailable = () => window.isSecureContext && 'geolocation' in navigator;
