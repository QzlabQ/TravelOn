package org.microarchitecturovisco.transport.model.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class TicketOfferDto {
    private String id;
    private String ticketOfferId;
    private String type;
    private String departureCity;
    private String arrivalCity;
    private String departureCityId;
    private String arrivalCityId;
    private String departureStationCode;
    private String departureTerminalName;
    private String departureStationName;
    private String arrivalStationCode;
    private String arrivalTerminalName;
    private String arrivalStationName;
    private String departureTime;
    private String arrivalTime;
    private String duration;
    private String carrier;
    private String code;
    private String seatClass;
    private int price;
    private int remainingSeats;
    private int totalSeats;
}
