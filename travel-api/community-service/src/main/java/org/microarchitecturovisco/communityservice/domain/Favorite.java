package org.microarchitecturovisco.communityservice.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** A user's bookmark of a community post, route or attraction. */
@Entity
@Table(name = "community_favorite", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "type", "target_id"}))
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Favorite {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private FavoriteTargetType type;

    @Column(name = "target_id", nullable = false)
    private String targetId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
