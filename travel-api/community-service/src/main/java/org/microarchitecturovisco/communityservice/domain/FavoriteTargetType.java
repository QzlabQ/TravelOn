package org.microarchitecturovisco.communityservice.domain;

/**
 * Kinds of community entities that can be favorited (and, for POST/ROUTE,
 * commented on). Stored as a string; see the CHECK constraints in
 * community_schema.sql.
 */
public enum FavoriteTargetType {
    POST,
    ROUTE,
    ATTRACTION
}
