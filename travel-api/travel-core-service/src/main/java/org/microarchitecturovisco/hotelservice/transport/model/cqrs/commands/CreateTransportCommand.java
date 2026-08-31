package org.microarchitecturovisco.hotelservice.transport.model.cqrs.commands;

import lombok.Builder;
import lombok.Data;
import org.microarchitecturovisco.hotelservice.transport.model.dto.TransportDto;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class CreateTransportCommand {
    private UUID uuid;
    private LocalDateTime commandTimeStamp;

    private TransportDto transportDto;
}
