package org.microarchitecturovisco.communityservice.messaging;

import java.util.UUID;

/** Mirror of user-service's event; parsed from the JSON message body. */
public record UserProfileChangedEvent(UUID userId, String name, String surname, String email) {

    /** Same rule as UserProfileResponse.displayName(): "name surname" trimmed, else email. */
    public String displayName() {
        String fullName = ((name == null ? "" : name) + " " + (surname == null ? "" : surname)).trim();
        return fullName.isBlank() ? (email == null ? "" : email) : fullName;
    }
}
