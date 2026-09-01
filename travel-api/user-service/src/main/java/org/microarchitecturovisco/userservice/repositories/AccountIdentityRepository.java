package org.microarchitecturovisco.userservice.repositories;

import org.microarchitecturovisco.userservice.domain.AccountIdentity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface AccountIdentityRepository extends JpaRepository<AccountIdentity, UUID> {
    Optional<AccountIdentity> findByUserId(UUID userId);
}