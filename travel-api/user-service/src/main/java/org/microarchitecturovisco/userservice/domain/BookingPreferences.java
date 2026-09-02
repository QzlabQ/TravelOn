package org.microarchitecturovisco.userservice.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Builder
@Data
@AllArgsConstructor
@NoArgsConstructor
@Table(name = "booking_preferences")
public class BookingPreferences {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, unique = true)
    private UUID userId;

    @Column(name = "default_departure_city", nullable = false, length = 80)
    private String defaultDepartureCity;

    @Column(name = "default_arrival_city", nullable = false, length = 80)
    private String defaultArrivalCity;

    @Column(name = "preferred_hotel_min_rating", nullable = false, precision = 2, scale = 1)
    private BigDecimal preferredHotelMinRating;

    @Column(name = "preferred_hotel_max_price", length = 32)
    private String preferredHotelMaxPrice;

    @Column(name = "preferred_train_types", nullable = false, length = 255)
    private String preferredTrainTypes;

    @Column(name = "only_available_tickets", nullable = false)
    private boolean onlyAvailableTickets;

    private Instant createdAt;

    private Instant updatedAt;

    @PrePersist
    public void prePersist() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = Instant.now();
    }
}
