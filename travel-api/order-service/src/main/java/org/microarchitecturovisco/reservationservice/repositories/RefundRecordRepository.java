package org.microarchitecturovisco.reservationservice.repositories;

import org.microarchitecturovisco.reservationservice.domain.entity.RefundRecord;
import org.microarchitecturovisco.reservationservice.domain.entity.RefundStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RefundRecordRepository extends JpaRepository<RefundRecord, UUID> {
    List<RefundRecord> findByReservationIdOrderByRequestedAtDesc(UUID reservationId);

    Optional<RefundRecord> findFirstByReservationIdAndStatusOrderByRequestedAtDesc(UUID reservationId, RefundStatus status);
}
