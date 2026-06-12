package org.microarchitecturovisco.userservice.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.time.Instant;
import java.util.UUID;


@Entity
@Builder
@Data
@AllArgsConstructor
@NoArgsConstructor
@Table(name = "users")
public class User {

    @Id
    private UUID id;

    @NotNull
    @Email(regexp = ".+[@].+[\\.].+")
    @Size(max = 100)
    @Column(unique = true, nullable = false)
    private String email;

    @NotNull
    @Column(nullable = false)
    private String passwordHash;

    @NotNull
    @Size(max = 50)
    private String name;

    @NotNull
    @Size(max = 50)
    private String surname;

    @Size(max = 32)
    private String phone;

    @Size(max = 255)
    private String avatarUrl;

    @Size(max = 32)
    private String loyaltyTier;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private UserRole role;

    @Column(unique = true)
    private String sessionToken;

    private Instant createdAt;

    private Instant updatedAt;

    private Instant lastLoginAt;

    @PrePersist
    public void prePersist() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
        if (loyaltyTier == null || loyaltyTier.isBlank()) {
            loyaltyTier = "Explorer";
        }
        if (role == null) {
            role = UserRole.USER;
        }
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = Instant.now();
    }
}
