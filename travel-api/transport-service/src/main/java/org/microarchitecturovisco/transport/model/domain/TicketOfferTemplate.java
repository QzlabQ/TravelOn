package org.microarchitecturovisco.transport.model.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Column;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "ticket_offer_templates")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TicketOfferTemplate {
    @Id
    private UUID id;

    @Enumerated(EnumType.STRING)
    private TicketType type;

    private String departureCity;
    private String arrivalCity;
    private String departureStation;
    private String arrivalStation;
    private LocalTime departureTime;
    private LocalTime arrivalTime;
    private String carrier;
    private String code;
    private String seatClass;
    private int price;
    private int remainingSeats;
    private boolean studentEligible;
    private LocalDate referenceDate;
    private String sourceUrl;

    @Column(columnDefinition = "TEXT")
    private String sourceNote;
}
