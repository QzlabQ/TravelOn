package org.microarchitecturovisco.userservice.dto;

import org.microarchitecturovisco.userservice.domain.AccountIdentity;

import java.time.Instant;
import java.util.UUID;

public record AccountIdentityResponse(
        UUID id,
        String realName,
        String documentType,
        String documentNumber,
        Instant updatedAt
) {
    public static AccountIdentityResponse from(AccountIdentity identity) {
        return new AccountIdentityResponse(
                identity.getId(),
                identity.getRealName(),
                identity.getDocumentType(),
                identity.getDocumentNumber(),
                identity.getUpdatedAt()
        );
    }
}