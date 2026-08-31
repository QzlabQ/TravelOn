package org.microarchitecturovisco.hotelservice.model.dto;

import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@NoArgsConstructor
@AllArgsConstructor
@Data
@Builder
public class RoomReservationDto {

    private UUID reservationId;

    private Long roomId;

    private Integer hotelId;

    private LocalDateTime dateFrom;

    private LocalDateTime dateTo;
}
