package org.microarchitecturovisco.communityservice.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/**
 * A single stop within a {@link TravelRoute}. Each stop references a community
 * attraction by id (the only allowed source of attractions) and keeps a snapshot
 * of its name/city/cover so the itinerary still renders if the attraction changes.
 */
@Entity
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RouteStop {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "route_id", nullable = false)
    private TravelRoute route;

    @Column(nullable = false)
    private UUID attractionId;

    @Column(nullable = false, length = 120)
    private String attractionName;

    @Column(length = 255)
    private String attractionCity;

    @Column(length = 1000)
    private String coverImageUrl;

    /** 1-based day this stop belongs to. */
    @Column(nullable = false)
    private int dayNumber;

    /** Order of this stop within its day. */
    @Column(nullable = false)
    private int sortOrder;

    @Column(length = 1000)
    private String note;
}
