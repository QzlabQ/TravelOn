package org.microarchitecturovisco.userservice.services;

import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.userservice.domain.User;
import org.microarchitecturovisco.userservice.domain.UserRole;
import org.microarchitecturovisco.userservice.dto.LoginRequest;
import org.microarchitecturovisco.userservice.repositories.UserRepository;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserServicePasswordMigrationTest {

    @Test
    void successfulLegacyLoginUpgradesStoredHash() {
        UserRepository repository = mock(UserRepository.class);
        PasswordHasher hasher = new PasswordHasher();
        UserEventPublisher eventPublisher = mock(UserEventPublisher.class);
        UserService service = new UserService(repository, hasher, eventPublisher);
        User user = User.builder()
                .id(UUID.randomUUID())
                .email("john@example.com")
                .passwordHash(PasswordHasher.legacySha256("password1"))
                .name("John")
                .surname("Doe")
                .role(UserRole.USER)
                .build();

        when(repository.findByEmailIgnoreCase("john@example.com")).thenReturn(Optional.of(user));
        when(repository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.login(new LoginRequest("john@example.com", "password1"));

        assertFalse(user.getPasswordHash().matches("[0-9a-f]{64}"));
        assertTrue(hasher.matches("password1", user.getPasswordHash()));
        verify(repository).save(user);
    }
}
