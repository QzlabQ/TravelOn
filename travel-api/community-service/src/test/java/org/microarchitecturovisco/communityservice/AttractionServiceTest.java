package org.microarchitecturovisco.communityservice;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.communityservice.domain.Attraction;
import org.microarchitecturovisco.communityservice.domain.City;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;
import org.microarchitecturovisco.communityservice.dto.AttractionResponse;
import org.microarchitecturovisco.communityservice.dto.CreateAttractionRequest;
import org.microarchitecturovisco.communityservice.dto.CreateAttractionReviewRequest;
import org.microarchitecturovisco.communityservice.dto.ReviewResponse;
import org.microarchitecturovisco.communityservice.dto.UserProfileResponse;
import org.microarchitecturovisco.communityservice.repository.AttractionRepository;
import org.microarchitecturovisco.communityservice.repository.CityRepository;
import org.microarchitecturovisco.communityservice.repository.ReviewRepository;
import org.microarchitecturovisco.communityservice.repository.TargetRatingAggregate;
import org.microarchitecturovisco.communityservice.service.AttractionService;
import org.microarchitecturovisco.communityservice.service.UserClient;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AttractionServiceTest {

    private AttractionRepository attractionRepository;
    private ReviewRepository reviewRepository;
    private CityRepository cityRepository;
    private UserClient userClient;
    private AttractionService attractionService;
    private UserProfileResponse user;
    private City hangzhouCity;

    @BeforeEach
    void setUp() {
        attractionRepository = mock(AttractionRepository.class);
        reviewRepository = mock(ReviewRepository.class);
        cityRepository = mock(CityRepository.class);
        userClient = mock(UserClient.class);
        attractionService = new AttractionService(attractionRepository, reviewRepository, cityRepository, userClient);
        user = new UserProfileResponse(UUID.randomUUID(), "lily@example.com", "Lily", "Chen", null, null, "Explorer",
                Instant.now(), Instant.now(), Instant.now());
        hangzhouCity = City.builder()
                .id(UUID.randomUUID())
                .cityId("HGZ")
                .region("Hangzhou")
                .country("中国")
                .build();
    }

    @Test
    void createsNewAttractionAndSetsCreatedBy() {
        when(userClient.requireUser("token")).thenReturn(user);
        when(cityRepository.findByCityId("HGZ")).thenReturn(Optional.of(hangzhouCity));
        when(attractionRepository.findByNameAndCityId(anyString(), anyString())).thenReturn(Optional.empty());
        when(attractionRepository.save(any(Attraction.class))).thenAnswer(inv -> inv.getArgument(0));
        when(reviewRepository.countByTargetTypeAndTargetId(any(), anyString())).thenReturn(0L);
        when(reviewRepository.averageRating(any(), anyString())).thenReturn(0.0);

        AttractionResponse response = attractionService.create("token",
                new CreateAttractionRequest("West Lake", "HGZ", "Famous scenic area.", null));

        assertThat(response.name()).isEqualTo("West Lake");
        assertThat(response.city()).isEqualTo("Hangzhou");
        assertThat(response.cityId()).isEqualTo("HGZ");
        assertThat(response.createdByName()).isEqualTo("Lily Chen");
        assertThat(response.averageRating()).isEqualTo(0.0);
        assertThat(response.reviewCount()).isEqualTo(0L);
    }

    @Test
    void returnsExistingAttractionOnDuplicate() {
        when(userClient.requireUser("token")).thenReturn(user);
        when(cityRepository.findByCityId("HGZ")).thenReturn(Optional.of(hangzhouCity));
        Attraction existing = attraction("West Lake", hangzhouCity);
        when(attractionRepository.findByNameAndCityId("West Lake", "HGZ")).thenReturn(Optional.of(existing));
        when(reviewRepository.countByTargetTypeAndTargetId(ReviewTargetType.SCENIC_SPOT, existing.getId().toString())).thenReturn(3L);
        when(reviewRepository.averageRating(ReviewTargetType.SCENIC_SPOT, existing.getId().toString())).thenReturn(4.3);

        AttractionResponse response = attractionService.create("token",
                new CreateAttractionRequest("West Lake", "HGZ", "Another description", null));

        assertThat(response.id()).isEqualTo(existing.getId());
        assertThat(response.reviewCount()).isEqualTo(3L);
        assertThat(response.averageRating()).isEqualTo(4.3);
        verify(attractionRepository, never()).save(any());
    }

    @Test
    void listMergesBatchRatings() {
        City huangshanCity = City.builder().id(UUID.randomUUID()).cityId("HSH").region("Huangshan").country("中国").build();
        Attraction a1 = attraction("West Lake", hangzhouCity);
        Attraction a2 = attraction("Yellow Mountain", huangshanCity);
        when(attractionRepository.findFiltered(null, null))
                .thenReturn(List.of(a1, a2));

        TargetRatingAggregate agg = mockAggregate(a1.getId().toString(), 4.5, 10L);
        when(reviewRepository.aggregateRatings(eq(ReviewTargetType.SCENIC_SPOT), anyList()))
                .thenReturn(List.of(agg));

        List<AttractionResponse> results = attractionService.list(null, null, "popular", 0, 10).getContent();

        assertThat(results).hasSize(2);
        AttractionResponse first = results.stream().filter(r -> r.id().equals(a1.getId())).findFirst().orElseThrow();
        assertThat(first.averageRating()).isEqualTo(4.5);
        assertThat(first.reviewCount()).isEqualTo(10L);

        AttractionResponse second = results.stream().filter(r -> r.id().equals(a2.getId())).findFirst().orElseThrow();
        assertThat(second.averageRating()).isEqualTo(0.0);
        assertThat(second.reviewCount()).isEqualTo(0L);

        // popular ranking puts the reviewed attraction first
        assertThat(results.get(0).id()).isEqualTo(a1.getId());
    }

    @Test
    void createReviewForcesScenSpotTypeAndName() {
        when(userClient.requireUser("token")).thenReturn(user);
        Attraction a = attraction("West Lake", hangzhouCity);
        when(attractionRepository.findById(a.getId())).thenReturn(Optional.of(a));
        when(reviewRepository.findMaxId()).thenReturn(0L);
        when(reviewRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ReviewResponse response = attractionService.createReview("token", a.getId(),
                new CreateAttractionReviewRequest(5, "Absolutely beautiful!"));

        assertThat(response.targetType()).isEqualTo(ReviewTargetType.SCENIC_SPOT);
        assertThat(response.targetId()).isEqualTo(a.getId().toString());
        assertThat(response.targetName()).isEqualTo("West Lake");
        assertThat(response.rating()).isEqualTo(5);
        assertThat(response.authorName()).isEqualTo("Lily Chen");
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private Attraction attraction(String name, City city) {
        return Attraction.builder()
                .id(UUID.randomUUID())
                .name(name)
                .city(city)
                .createdByUserId(user.id())
                .createdByName("Lily Chen")
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();
    }

    private TargetRatingAggregate mockAggregate(String targetId, double avg, long cnt) {
        return new TargetRatingAggregate() {
            public String getTargetId() { return targetId; }
            public double getAvg() { return avg; }
            public long getCnt() { return cnt; }
        };
    }
}
