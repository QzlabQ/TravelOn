package org.microarchitecturovisco.hotelservice.model.cqrs.commands;

import lombok.Builder;
import lombok.Data;
import org.microarchitecturovisco.hotelservice.model.dto.HotelDto;


import java.time.LocalDateTime;
@Data
@Builder
public class CreateHotelCommand {
    private Integer hotelId;
    private LocalDateTime commandTimeStamp;

    private HotelDto hotelDto;
}
