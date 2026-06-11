package org.microarchitecturovisco.communityservice.domain;

/**
 * Travel style of a user-authored {@link TravelRoute}. Stored as a string so the
 * set can grow without breaking existing rows (see the matching CHECK constraint
 * in community_schema.sql). Display labels live on the frontend.
 */
public enum TravelStyle {
    LEISURE,
    CULTURE,
    NATURE,
    FOOD,
    FAMILY,
    ADVENTURE,
    ROMANTIC,
    OTHER
}
