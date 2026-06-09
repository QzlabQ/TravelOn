package org.microarchitecturovisco.transport.model.events;

import lombok.*;
import lombok.experimental.SuperBuilder;

import java.time.LocalDateTime;
import java.util.UUID;

@AllArgsConstructor
@RequiredArgsConstructor
@Getter
@Setter
@SuperBuilder
public abstract class TransportEvent {
    private UUID id;

    private LocalDateTime eventTimeStamp;

    private UUID idTransport;
}
