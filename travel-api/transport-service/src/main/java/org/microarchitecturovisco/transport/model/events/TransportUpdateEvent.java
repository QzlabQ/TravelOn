package org.microarchitecturovisco.transport.model.events;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;

import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.util.UUID;

@NoArgsConstructor
@SuperBuilder
@Getter
@Setter
public class TransportUpdateEvent extends TransportEvent {
    private int capacity;
    private BigDecimal pricePerAdult;

    public TransportUpdateEvent(UUID transportId, int capacity, BigDecimal pricePerAdult){
        this.setEventTimeStamp(LocalDateTime.now());
        this.setIdTransport(transportId);
        this.capacity = capacity;
        this.pricePerAdult = pricePerAdult;
    }
}
