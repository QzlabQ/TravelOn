package org.microarchitecturovisco.transport.model.dto.response;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class TicketOptionsDto {
    private List<String> departures;
    private List<String> arrivals;
}
