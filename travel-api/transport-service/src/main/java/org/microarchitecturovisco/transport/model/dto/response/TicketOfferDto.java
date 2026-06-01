package org.microarchitecturovisco.transport.model.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;

@Data
@Builder
public class TicketOfferDto {
    private String id;
    private String type;
    private String departureCity;
    private String arrivalCity;
    private String departureStation;
    private String arrivalStation;
    private String departureTime;
    private String arrivalTime;
    private String duration;
    private String carrier;
    private String code;
    private String seatClass;
    private int price;
    private int remainingSeats;
    private boolean studentEligible;
    private String successRate;
    private String notice;
    private LocalDate departureDate;
    private LocalDate referenceDate;
    private String sourceUrl;
    private String sourceNote;
}
