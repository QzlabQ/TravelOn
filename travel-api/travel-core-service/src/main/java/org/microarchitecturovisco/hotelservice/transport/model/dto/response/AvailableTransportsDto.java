package org.microarchitecturovisco.hotelservice.transport.model.dto.response;

import lombok.Builder;
import lombok.Data;
import org.microarchitecturovisco.hotelservice.transport.model.dto.LocationDto;

import java.util.List;

@Data
@Builder
public class AvailableTransportsDto {
    private AvailableTransportsDepartures departures;
    private List<LocationDto> arrivals;
}
