package org.microarchitecturovisco.reservationservice.domain.events;

import java.util.Date;
import java.util.UUID;

public abstract class ReservationEvent {
    public final String uuid = UUID.randomUUID().toString();
    public final Date timestamp = new Date();
}
