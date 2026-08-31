package org.microarchitecturovisco.hotelservice.transport.model.dto.response;


import lombok.Builder;
import lombok.Data;
import org.microarchitecturovisco.hotelservice.transport.model.dto.LocationDto;

import java.util.List;

@Data
@Builder
public class AvailableTransportsDepartures {
    private List<LocationDto> bus;
    private List<LocationDto> plane;
    private List<LocationDto> train;
}
