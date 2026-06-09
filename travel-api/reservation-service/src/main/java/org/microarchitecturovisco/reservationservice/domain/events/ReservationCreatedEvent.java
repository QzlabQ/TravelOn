package org.microarchitecturovisco.reservationservice.domain.events;

import lombok.*;
import org.microarchitecturovisco.reservationservice.domain.entity.ReservationStatus;
import org.microarchitecturovisco.reservationservice.domain.entity.BookingPersonSnapshot;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class ReservationCreatedEvent extends ReservationEvent {
    private UUID idReservation;
    private LocalDateTime hotelTimeFrom;
    private LocalDateTime hotelTimeTo;
    private int infantsQuantity;
    private int kidsQuantity;
    private int teensQuantity;
    private int adultsQuantity;
    private float price;
    private boolean paid;
    private ReservationStatus status;
    private String bookingType;
    private Integer hotelId;
    private List<Long> roomReservationsIds;
    private List<UUID> transportReservationsIds;
    private UUID userId;
    private String title;
    private String routeFrom;
    private String routeTo;
    private String provider;
    private String bookingCode;
    private List<BookingPersonSnapshot> travelers;
}
