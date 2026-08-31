package org.microarchitecturovisco.hotelservice.model.events;


import lombok.*;
import lombok.experimental.SuperBuilder;
import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@SuperBuilder
public class RoomReservationCreatedEvent extends HotelEvent {
    private LocalDateTime dateFrom;
    private LocalDateTime dateTo;
    private UUID idRoomReservation;
    private Long idRoom;
}
