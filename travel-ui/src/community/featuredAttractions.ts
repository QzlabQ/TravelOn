/**
 * Official built-in attractions seeded into the database (see community_seed.sql).
 * These ids are fixed and mirror the protection list in the community-service
 * AttractionService — they are read-only and cannot be edited or deleted, even by
 * an admin. Kept here so the home-page preview and the attraction detail page can
 * recognise them without an extra round-trip.
 */
export const FEATURED_ATTRACTION_IDS = [
    "f0000000-0000-4000-a000-000000000001",
    "f0000000-0000-4000-a000-000000000002",
    "f0000000-0000-4000-a000-000000000003",
    "f0000000-0000-4000-a000-000000000004",
];

export const isFeaturedAttraction = (id?: string | null): boolean =>
    Boolean(id) && FEATURED_ATTRACTION_IDS.includes(id as string);
