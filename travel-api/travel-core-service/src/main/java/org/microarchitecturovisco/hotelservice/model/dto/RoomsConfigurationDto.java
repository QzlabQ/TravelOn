package org.microarchitecturovisco.hotelservice.model.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.math.BigDecimal;
@Data
@Builder
public class RoomsConfigurationDto {
    private List<RoomResponseDto> rooms;
    private BigDecimal pricePerAdult;
}
