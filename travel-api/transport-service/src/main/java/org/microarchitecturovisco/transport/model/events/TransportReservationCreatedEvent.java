package org.microarchitecturovisco.transport.model.events;

import lombok.*;
import lombok.experimental.SuperBuilder;

import java.util.UUID;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@SuperBuilder
public class TransportReservationCreatedEvent extends TransportEvent {

    private UUID reservationId;
    private int numberOfSeats;

}
