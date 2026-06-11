package org.microarchitecturovisco.communityservice.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A user-authored travel itinerary shared in the community. A route bundles
 * trip-level attributes (days, party size, budget, style) with an ordered list
 * of {@link RouteStop}s, each referencing an existing community attraction.
 */
@Entity
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TravelRoute {

    @Id
    private UUID id;

    @Column(nullable = false, length = 120)
    private String title;

    @Column(length = 4000)
    private String summary;

    /** Total trip length in days. */
    @Column(nullable = false)
    private int days;

    /** Recommended party size. */
    @Column(nullable = false)
    private int peopleCount;

    /** Estimated per-person budget in CNY. */
    @Column(nullable = false)
    private int budget;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TravelStyle style;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "destination_city_id", referencedColumnName = "city_id")
    private City destinationCity;

    @Column(length = 1000)
    private String coverImageUrl;

    @ElementCollection
    @CollectionTable(name = "travel_route_images", joinColumns = @JoinColumn(name = "route_id"))
    @Column(name = "image_url", length = 1000)
    @Builder.Default
    private List<String> imageUrls = new ArrayList<>();

    @OneToMany(mappedBy = "route", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @OrderBy("dayNumber asc, sortOrder asc")
    @Builder.Default
    private List<RouteStop> stops = new ArrayList<>();

    @Column(nullable = false)
    private UUID authorUserId;

    @Column(nullable = false)
    private String authorName;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    @PrePersist
    public void prePersist() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = Instant.now();
    }
}
