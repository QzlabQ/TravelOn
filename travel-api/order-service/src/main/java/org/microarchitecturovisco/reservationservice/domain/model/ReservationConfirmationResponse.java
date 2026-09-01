package org.microarchitecturovisco.reservationservice.domain.model;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.util.Map;

@Data
@Builder
public class ReservationConfirmationResponse {
    private String hotelName;
    private BigDecimal price;
    private LocalDateTime dateFrom;
    private LocalDateTime dateTo;
    private Integer adults;
    private Integer infants;
    private Integer kids;
    private Integer teens;
    private Map<String, Integer> roomTypes;
    private TransportReservationResponse transport;
}
