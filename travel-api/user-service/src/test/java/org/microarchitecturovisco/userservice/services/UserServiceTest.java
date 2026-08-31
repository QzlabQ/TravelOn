package org.microarchitecturovisco.userservice.services;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.microarchitecturovisco.userservice.domain.User;
import org.microarchitecturovisco.userservice.domain.UserRole;
import org.microarchitecturovisco.userservice.dto.ChangePasswordRequest;
import org.microarchitecturovisco.userservice.dto.LoginRequest;
import org.microarchitecturovisco.userservice.dto.RegisterRequest;
import org.microarchitecturovisco.userservice.dto.UpdateProfileRequest;
import org.microarchitecturovisco.userservice.repositories.UserRepository;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock UserRepository userRepository;
    @Mock PasswordHasher passwordHasher;
    @InjectMocks UserService userService;

    @Test
    void registerNormalizesEmailAndSavesProfileDefaults() {
        when(userRepository.existsByEmailIgnoreCase("alice@example.com")).thenReturn(false);
        when(passwordHasher.hash("secret123")).thenReturn("hashed-secret");
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = userService.register(new RegisterRequest(" Alice@Example.com ", "secret123", " Alice ", " Smith ", " 13800138000 "));

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        User saved = captor.getValue();
        assertThat(saved.getEmail()).isEqualTo("alice@example.com");
        assertThat(saved.getName()).isEqualTo("Alice");
        assertThat(saved.getSurname()).isEqualTo("Smith");
        assertThat(saved.getPhone()).isEqualTo("13800138000");
        assertThat(saved.getRole()).isEqualTo(UserRole.USER);
        assertThat(saved.getLoyaltyTier()).isEqualTo("Explorer");
        assertThat(saved.getPasswordHash()).isEqualTo("hashed-secret");
        assertThat(response.token()).isEqualTo(saved.getSessionToken());
    }

    @Test
    void registerRejectsDuplicateEmailWithConflict() {
        when(userRepository.existsByEmailIgnoreCase("alice@example.com")).thenReturn(true);

        assertThatThrownBy(() -> userService.register(new RegisterRequest("alice@example.com", "secret123", "Alice", null, null)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409 CONFLICT");
        verify(userRepository, never()).save(any());
    }

    @Test
    void loginRejectsWrongPasswordWithUnauthorized() {
        User user = User.builder().id(UUID.randomUUID()).email("alice@example.com")
                .passwordHash("hashed-correct").sessionToken("old").build();
        when(userRepository.findByEmailIgnoreCase("alice@example.com")).thenReturn(Optional.of(user));
        when(passwordHasher.matches("wrong", "hashed-correct")).thenReturn(false);

        assertThatThrownBy(() -> userService.login(new LoginRequest("alice@example.com", "wrong")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("401 UNAUTHORIZED");
        verify(userRepository, never()).save(any());
    }

    @Test
    void changePasswordVerifiesCurrentPasswordAndStoresNewHash() {
        UUID userId = UUID.randomUUID();
        User user = User.builder().id(userId).sessionToken("token").passwordHash("old-hash").build();
        when(userRepository.findBySessionToken("token")).thenReturn(Optional.of(user));
        when(passwordHasher.matches("old-password", "old-hash")).thenReturn(true);
        when(passwordHasher.hash("new-password")).thenReturn("new-hash");

        userService.changePassword("token", new ChangePasswordRequest("old-password", "new-password"));

        assertThat(user.getPasswordHash()).isEqualTo("new-hash");
        verify(userRepository).save(user);
        verify(passwordHasher).hash("new-password");
    }

    @Test
    void changePasswordRejectsIncorrectCurrentPassword() {
        User user = User.builder().id(UUID.randomUUID()).sessionToken("token").passwordHash("old-hash").build();
        when(userRepository.findBySessionToken("token")).thenReturn(Optional.of(user));
        when(passwordHasher.matches("wrong-password", "old-hash")).thenReturn(false);

        assertThatThrownBy(() -> userService.changePassword("token", new ChangePasswordRequest("wrong-password", "new-password")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400 BAD_REQUEST");
        verify(userRepository, never()).save(any());
        verify(passwordHasher, never()).hash(any());
    }

    @Test
    void changePasswordRejectsReusingCurrentPassword() {
        User user = User.builder().id(UUID.randomUUID()).sessionToken("token").passwordHash("old-hash").build();
        when(userRepository.findBySessionToken("token")).thenReturn(Optional.of(user));
        when(passwordHasher.matches("same-password", "old-hash")).thenReturn(true);

        assertThatThrownBy(() -> userService.changePassword("token", new ChangePasswordRequest("same-password", "same-password")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400 BAD_REQUEST");
        verify(userRepository, never()).save(any());
        verify(passwordHasher, never()).hash(any());
    }
    @Test
    void requireUserByTokenRejectsMissingAndUnknownTokens() {
        assertThatThrownBy(() -> userService.requireUserByToken(" "))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("401 UNAUTHORIZED");
        when(userRepository.findBySessionToken("missing")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> userService.requireUserByToken("missing"))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("401 UNAUTHORIZED");
    }

    @Test
    void updateProfileRejectsEmailOwnedByAnotherUser() {
        UUID currentId = UUID.randomUUID();
        User current = User.builder().id(currentId).sessionToken("token").email("old@example.com").name("Alice").build();
        User other = User.builder().id(UUID.randomUUID()).email("new@example.com").build();
        when(userRepository.findBySessionToken("token")).thenReturn(Optional.of(current));
        when(userRepository.findByEmailIgnoreCase("new@example.com")).thenReturn(Optional.of(other));

        assertThatThrownBy(() -> userService.updateProfile("token", new UpdateProfileRequest("new@example.com", null, null, null, null)))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("409 CONFLICT");
        verify(userRepository, never()).save(any());
    }
}
