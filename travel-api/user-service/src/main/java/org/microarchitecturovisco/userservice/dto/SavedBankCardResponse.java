package org.microarchitecturovisco.userservice.dto;

import org.microarchitecturovisco.userservice.domain.SavedBankCard;

import java.time.Instant;
import java.util.UUID;

public record SavedBankCardResponse(
        UUID id,
        String cardNumber,
        String label,
        Instant createdAt
) {
    public static SavedBankCardResponse from(SavedBankCard card) {
        return new SavedBankCardResponse(card.getId(), card.getCardNumber(), card.getLabel(), card.getCreatedAt());
    }
}