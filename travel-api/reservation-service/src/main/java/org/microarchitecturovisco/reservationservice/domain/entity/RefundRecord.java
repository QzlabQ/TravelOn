package org.microarchitecturovisco.reservationservice.domain.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RefundRecord {

    @Id
    private UUID id;

    @NotNull
    private UUID reservationId;

    @NotNull
    @Column(precision = 12, scale = 2, nullable = false)
    private BigDecimal amount;

    @Column(length = 240)
    private String reason;

    @Enumerated(EnumType.STRING)
    @NotNull
    private RefundStatus status;

    private LocalDateTime requestedAt;

    private LocalDateTime completedAt;

    @PrePersist
    public void prePersist() {
        if (status == null) {
            status = RefundStatus.PROCESSING;
        }
        if (requestedAt == null) {
            requestedAt = LocalDateTime.now();
        }
    }
}
