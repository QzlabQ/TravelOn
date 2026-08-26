package org.microarchitecturovisco.offerprovider.domain.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.math.BigDecimal;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class RoomsConfigurationDto {
    private List<RoomResponseDto> rooms;
    private BigDecimal pricePerAdult;
}
