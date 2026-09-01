package org.microarchitecturovisco.reservationservice.domain.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.util.ArrayList;
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
    @Column(precision = 12, scale = 2, nullable = false)
    private BigDecimal price;

    @NotNull
    private boolean paid;

    @Enumerated(EnumType.STRING)
    @NotNull
    private ReservationStatus status;

    @NotNull
    private String bookingType;

    private Integer hotelId;

    @ElementCollection(fetch = FetchType.EAGER)
    private List<Long> roomReservationsIds;

    @ElementCollection(fetch = FetchType.EAGER)
    private List<UUID> transportReservationsIds;

    @NotNull
    private UUID userId;

    private String title;

    private String provider;

    private String bookingCode;

    @ElementCollection(fetch = FetchType.EAGER)
    private List<BookingPersonSnapshot> travelers;

    private LocalDateTime createdAt;

    private LocalDateTime paymentDeadline;

    private LocalDateTime paidAt;

    private LocalDateTime cancelledAt;

    private LocalDateTime refundRequestedAt;

    private LocalDateTime refundedAt;

    @Column(length = 240)
    private String cancellationReason;

    @PrePersist
    public void prePersist() {
        if (status == null) {
            status = paid ? ReservationStatus.PAID : ReservationStatus.PENDING_PAYMENT;
        }
        if (bookingType == null || bookingType.isBlank()) {
            bookingType = "PACKAGE";
        }
        if (travelers == null) {
            travelers = new ArrayList<>();
        }
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
        if (paymentDeadline == null) {
            paymentDeadline = createdAt.plusMinutes(30);
        }
    }
}
