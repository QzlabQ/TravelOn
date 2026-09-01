package org.microarchitecturovisco.userservice.repositories;

import org.microarchitecturovisco.userservice.domain.SavedBankCard;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SavedBankCardRepository extends JpaRepository<SavedBankCard, UUID> {
    List<SavedBankCard> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<SavedBankCard> findByUserIdAndCardNumber(UUID userId, String cardNumber);

    Optional<SavedBankCard> findByIdAndUserId(UUID id, UUID userId);
}