/** Turn-by-turn directions link. Opens the Google Maps app on phones that have it, the website otherwise. */
export const directionsUrl = (address: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
