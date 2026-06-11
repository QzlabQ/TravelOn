package org.microarchitecturovisco.aiarrangeservice.domain.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlannerBookingLink {
    private String type;
    private String label;
    private String url;
    private Integer hotelId;
    private String ticketOfferId;
    private String routeFrom;
    private String routeTo;
    private LocalDate departureDate;
    private String bookingCode;
    private String provider;
    private Double price;
}
