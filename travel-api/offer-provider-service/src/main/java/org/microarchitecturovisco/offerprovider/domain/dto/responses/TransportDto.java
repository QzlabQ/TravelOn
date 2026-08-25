package org.microarchitecturovisco.offerprovider.domain.dto.responses;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class TransportDto implements Serializable {
    private UUID idTransport;

    private LocalDateTime departureDate;
    private Integer capacity;
    private BigDecimal pricePerAdult;

    private TransportCourseDto transportCourse;
}
