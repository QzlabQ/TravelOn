package org.microarchitecturovisco.hotelservice.transport.model.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Column;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.math.BigDecimal;
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

    private String departureCityId;
    private String arrivalCityId;
    private String departureStationCode;
    private String departureTerminalName;
    private String departureStationName;
    private String arrivalStationCode;
    private String arrivalTerminalName;
    private String arrivalStationName;
    private LocalDateTime departureDateTime;
    private LocalDateTime arrivalDateTime;
    private String carrier;
    private String code;
    private String seatClass;
    @Column(precision = 12, scale = 2, nullable = false)
    private BigDecimal price;
    private int remainingSeats;
    private int totalSeats;
}
