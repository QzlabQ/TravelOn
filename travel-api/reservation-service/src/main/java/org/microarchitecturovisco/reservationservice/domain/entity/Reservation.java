package org.microarchitecturovisco.reservationservice.domain.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Entity
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@ToString
public class Reservation {

    @Id
    private UUID id;

    @NotNull
    private LocalDateTime hotelTimeFrom;

    @NotNull
    private LocalDateTime hotelTimeTo;

    private int childrenUnder3Quantity;

    private int childrenUnder10Quantity;

    private int childrenUnder18Quantity;

    @NotNull
    private int adultsQuantity;

    @NotNull
    private float price;

    @NotNull
    private boolean paid;

    @Enumerated(EnumType.STRING)
    @NotNull
    private ReservationStatus status;

    @NotNull
    private String bookingType;

    private UUID hotelId;

    @ElementCollection(fetch = FetchType.EAGER)
    private List<UUID> roomReservationsIds;

    @ElementCollection(fetch = FetchType.EAGER)
    private List<UUID> transportReservationsIds;

    @NotNull
    private UUID userId;

    private String title;

    private String routeFrom;

    private String routeTo;

    private String provider;

    private String bookingCode;

    @PrePersist
    public void prePersist() {
        if (status == null) {
            status = paid ? ReservationStatus.PAID : ReservationStatus.PENDING_PAYMENT;
        }
        if (bookingType == null || bookingType.isBlank()) {
            bookingType = "PACKAGE";
        }
    }
}
