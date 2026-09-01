package org.microarchitecturovisco.reservationservice.services;

import java.util.UUID;

public interface ReservationAuthorizationOperations {

    void requireReservationOwnerOrAdmin(String token, UUID reservationId);

    void requireOwnerOrAdmin(String token, UUID ownerUserId);

    void requireAdmin(String token);

    UUID requireUserId(String token);
}
