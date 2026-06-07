package org.microarchitecturovisco.userservice.repositories;

import org.microarchitecturovisco.userservice.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByEmailIgnoreCase(String email);

    Optional<User> findBySessionToken(String sessionToken);

    boolean existsByEmailIgnoreCase(String email);
}
