/**
 * Turn-by-turn directions links. iPhones and Macs get Apple Maps by default and everything
 * else Google Maps; the place page offers the other one too. A Google Maps link never opens
 * Apple Maps on an iPhone (it opens the Google app or website), hence both.
 */
export const googleDirectionsUrl = (address: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

/** Opens Apple Maps on Apple devices; Apple's maps website elsewhere. */
export const appleDirectionsUrl = (address: string) => `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`;

/** An iPhone, iPad or Mac (iPads report themselves as Macs). Browser only. */
export const isAppleDevice = () => /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

/** The visitor's platform's maps app first, then the other. Browser only. */
export function directionsFor(address: string) {
  const apple = { name: 'Apple Maps', url: appleDirectionsUrl(address) };
  const google = { name: 'Google Maps', url: googleDirectionsUrl(address) };
  return isAppleDevice() ? { main: apple, other: google } : { main: google, other: apple };
}
