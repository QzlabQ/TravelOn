package org.microarchitecturovisco.hotelservice.model.events;

import lombok.*;
import lombok.experimental.SuperBuilder;
import java.time.LocalDateTime;
import java.util.UUID;

@AllArgsConstructor
@RequiredArgsConstructor
@Getter
@Setter
@SuperBuilder
public abstract class HotelEvent {
    private UUID id;

    private LocalDateTime eventTimeStamp;

    private Integer idHotel;
}
