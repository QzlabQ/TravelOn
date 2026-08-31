package org.microarchitecturovisco.hotelservice.transport.model.dto;

import lombok.Builder;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.util.UUID;

@Data
@Builder
public class TransportDto implements Serializable {
    private UUID idTransport;

    private LocalDateTime departureDate;
    private Integer capacity;
    private BigDecimal pricePerAdult;

    private TransportCourseDto transportCourse;
}
