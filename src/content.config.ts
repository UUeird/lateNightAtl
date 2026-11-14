import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';
import { AREAS, TAGS, TYPES } from './data/taxonomy';

// "HH:MM", 24-hour clock. "24:00" is allowed as a closing time.
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'Use 24-hour "HH:MM"');

// A span is [open, close]. A close at or before open means it closes after midnight,
// e.g. ["18:00", "02:00"]. Open 24 hours is ["00:00", "24:00"].
const span = z.tuple([time, time]);
const day = z.array(span).optional(); // missing or [] = closed that day

const typeKey = z.enum(Object.keys(TYPES) as [keyof typeof TYPES, ...(keyof typeof TYPES)[]]);

const places = defineCollection({
  // PLACES_FILE lets tests build against fixed fixture data.
  loader: file(process.env.PLACES_FILE ?? 'src/data/places.json'),
  schema: z.object({
    name: z.string(),
    // One type, or a list for places that are several things (a CVS is a grocery and a pharmacy).
    type: z
      .union([typeKey, z.array(typeKey).min(1)])
      .transform((t) => (Array.isArray(t) ? t : [t])),
    cuisine: z.array(z.string().toLowerCase()).default([]),
    tags: z.array(z.enum(Object.keys(TAGS) as [keyof typeof TAGS, ...(keyof typeof TAGS)[]])).default([]),
    area: z.enum(AREAS),
    address: z.string(),
    lat: z.number().min(33.4).max(34.2),
    lng: z.number().min(-84.8).max(-84.0),
    hours: z.object({ sun: day, mon: day, tue: day, wed: day, thu: day, fri: day, sat: day }).strict(),
    url: z.url().optional(),
    phone: z.string().optional(),
    notes: z.string().optional(),
    lastVerified: z.iso.date(),
    // Every page relied on for this entry (hours, tags, notes), so it can be re-checked.
    // See "Sources" in the README for what counts.
    sources: z.array(z.url()).default([]),
  }),
});

export const collections = { places };
