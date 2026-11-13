/** Prefix a site path with the configured base (e.g. /lateNightAtl/). */
export const url = (path = '') => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
