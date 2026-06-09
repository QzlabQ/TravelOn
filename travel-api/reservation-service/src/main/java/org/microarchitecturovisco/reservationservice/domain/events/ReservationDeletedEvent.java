package org.microarchitecturovisco.reservationservice.domain.events;

import lombok.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class ReservationDeletedEvent extends ReservationEvent {
    private UUID idReservation;
    private LocalDateTime hotelTimeFrom;
    private LocalDateTime hotelTimeTo;
    private int infantsQuantity;
    private int kidsQuantity;
    private int teensQuantity;
    private int adultsQuantity;
    private float price;
    private boolean paid;
    private Integer hotelId;
    private List<Long> roomReservationsIds;
    private List<UUID> transportReservationsIds;
    private UUID userId;
}
