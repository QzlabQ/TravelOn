package org.microarchitecturovisco.reservationservice.domain.entity;

import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Embeddable
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BookingPersonSnapshot {
    private String travelerId;
    private String name;
    private String travelerType;
    private String documentType;
    private String documentNumber;
    private String phone;
}
