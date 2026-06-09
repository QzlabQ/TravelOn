package org.microarchitecturovisco.reservationservice.domain.commands;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class DeleteReservationCommand {
    private UUID id;
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
