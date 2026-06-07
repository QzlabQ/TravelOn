package org.microarchitecturovisco.reservationservice.repositories;

import org.microarchitecturovisco.reservationservice.domain.entity.PaymentTransaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PaymentTransactionRepository extends JpaRepository<PaymentTransaction, UUID> {
    List<PaymentTransaction> findByReservationIdOrderByCreatedAtDesc(UUID reservationId);
}
