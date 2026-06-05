package org.microarchitecturovisco.reservationservice.domain.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentTransaction {

    @Id
    private UUID id;

    @NotNull
    private UUID reservationId;

    @NotNull
    private float amount;

    @Column(length = 4)
    private String cardLast4;

    @NotNull
    private boolean approved;

    @NotNull
    @Column(length = 24)
    private String status;

    @Column(length = 240)
    private String failureReason;

    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
