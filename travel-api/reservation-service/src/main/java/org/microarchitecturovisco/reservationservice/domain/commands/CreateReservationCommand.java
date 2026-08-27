package org.microarchitecturovisco.reservationservice.domain.commands;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.reservationservice.domain.entity.ReservationStatus;
import org.microarchitecturovisco.reservationservice.domain.entity.BookingPersonSnapshot;

import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class CreateReservationCommand {
    private UUID id;
    private LocalDateTime hotelTimeFrom;
    private LocalDateTime hotelTimeTo;
    private int infantsQuantity;
    private int kidsQuantity;
    private int teensQuantity;
    private int adultsQuantity;
    private BigDecimal price;
    private boolean paid;
    private ReservationStatus status;
    private String bookingType;
    private Integer hotelId;
    private List<Long> roomReservationsIds;
    private List<UUID> transportReservationsIds;
    private UUID userId;
    private String title;
    private String provider;
    private String bookingCode;
    private List<BookingPersonSnapshot> travelers;
    private LocalDateTime paymentDeadline;
}
