package org.microarchitecturovisco.reservationservice.domain.dto;

import lombok.Builder;
import lombok.Data;

import java.util.Map;
import java.math.BigDecimal;

@Data
@Builder
public class HotelInfo {
    private String name;
    private BigDecimal hotelPrice;
    private Map<String, Integer> roomTypes;
}
