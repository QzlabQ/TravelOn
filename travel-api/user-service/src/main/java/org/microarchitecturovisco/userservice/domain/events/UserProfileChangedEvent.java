package org.microarchitecturovisco.userservice.domain.events;

import java.util.UUID;

/** Published when a user's profile changes, so denormalized copies of the
 *  display name (e.g. community authorName snapshots) can be refreshed. */
public record UserProfileChangedEvent(UUID userId, String name, String surname, String email) {
}
