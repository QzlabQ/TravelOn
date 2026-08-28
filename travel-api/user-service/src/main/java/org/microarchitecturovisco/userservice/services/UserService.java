package org.microarchitecturovisco.userservice.services;

import org.microarchitecturovisco.userservice.domain.User;
import org.microarchitecturovisco.userservice.domain.UserRole;
import org.microarchitecturovisco.userservice.dto.AuthResponse;
import org.microarchitecturovisco.userservice.dto.LoginRequest;
import org.microarchitecturovisco.userservice.dto.RegisterRequest;
import org.microarchitecturovisco.userservice.dto.UpdateProfileRequest;
import org.microarchitecturovisco.userservice.dto.UserProfileResponse;
import org.microarchitecturovisco.userservice.repositories.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.UUID;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final PasswordHasher passwordHasher;

    @Autowired
    public UserService(UserRepository userRepository, PasswordHasher passwordHasher) {
        this.userRepository = userRepository;
        this.passwordHasher = passwordHasher;
    }

    public AuthResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already registered");
        }

        User user = User.builder()
                .id(UUID.randomUUID())
                .email(email)
                .passwordHash(passwordHasher.hash(request.password()))
                .name(request.name().trim())
                .surname(normalizeOptional(request.surname()) == null ? "" : request.surname().trim())
                .phone(normalizeOptional(request.phone()))
                .loyaltyTier("Explorer")
                .role(UserRole.USER)
                .sessionToken(generateSessionToken())
                .lastLoginAt(Instant.now())
                .build();

        User savedUser = userRepository.save(user);
        return new AuthResponse(savedUser.getSessionToken(), UserProfileResponse.from(savedUser));
    }

    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmailIgnoreCase(normalizeEmail(request.email()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password"));

        if (!passwordHasher.matches(request.password(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }

        if (passwordHasher.needsUpgrade(user.getPasswordHash())) {
            user.setPasswordHash(passwordHasher.hash(request.password()));
        }

        user.setSessionToken(generateSessionToken());
        user.setLastLoginAt(Instant.now());
        User savedUser = userRepository.save(user);
        return new AuthResponse(savedUser.getSessionToken(), UserProfileResponse.from(savedUser));
    }

    public UserProfileResponse getProfileByToken(String token) {
        return UserProfileResponse.from(requireUserByToken(token));
    }

    public UserProfileResponse updateProfile(String token, UpdateProfileRequest request) {
        User user = requireUserByToken(token);

        if (hasText(request.email())) {
            String email = normalizeEmail(request.email());
            userRepository.findByEmailIgnoreCase(email)
                    .filter(existingUser -> !existingUser.getId().equals(user.getId()))
                    .ifPresent(existingUser -> {
                        throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already registered");
                    });
            user.setEmail(email);
        }

        if (hasText(request.name())) {
            user.setName(request.name().trim());
        }

        if (hasText(request.surname())) {
            user.setSurname(request.surname().trim());
        }

        if (request.phone() != null) {
            user.setPhone(normalizeOptional(request.phone()));
        }

        if (request.avatarUrl() != null) {
            user.setAvatarUrl(normalizeOptional(request.avatarUrl()));
        }

        return UserProfileResponse.from(userRepository.save(user));
    }

    public void logout(String token) {
        User user = requireUserByToken(token);
        user.setSessionToken(null);
        userRepository.save(user);
    }

    public User requireUserByToken(String token) {
        if (!hasText(token)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Missing session token");
        }
        return userRepository.findBySessionToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid session token"));
    }

    public String hashPassword(String password) {
        return passwordHasher.hash(password);
    }

    public boolean passwordMatches(String password, String storedHash) {
        return passwordHasher.matches(password, storedHash);
    }

    public boolean passwordNeedsUpgrade(String storedHash) {
        return passwordHasher.needsUpgrade(storedHash);
    }

    private String generateSessionToken() {
        return UUID.randomUUID() + "." + UUID.randomUUID();
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase();
    }

    private String normalizeOptional(String value) {
        return hasText(value) ? value.trim() : null;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
