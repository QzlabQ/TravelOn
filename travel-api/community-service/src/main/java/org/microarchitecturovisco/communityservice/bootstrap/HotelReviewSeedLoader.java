package org.microarchitecturovisco.communityservice.bootstrap;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.Review;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;
import org.microarchitecturovisco.communityservice.repository.ReviewRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
@ConditionalOnProperty(name = "app.seed-data.enabled", havingValue = "true")
@RequiredArgsConstructor
public class HotelReviewSeedLoader implements CommandLineRunner {

    private static final UUID SYSTEM_AUTHOR_ID = UUID.nameUUIDFromBytes("system:hotel-seed-reviewer".getBytes(StandardCharsets.UTF_8));
    private static final String SYSTEM_AUTHOR_NAME = "Seed Traveler";

    private final ReviewRepository reviewRepository;
    private final JdbcTemplate jdbcTemplate;

    @Value("${app.seed-data.hotel-reviews-csv:file:seed-data/hotel/hotel_reviews.csv}")
    private Resource hotelReviewsCsv;

    @Value("${app.seed-data.hotels-csv:file:seed-data/hotel/hotels.csv}")
    private Resource hotelsCsv;

    @Override
    public void run(String... args) throws Exception {
        updateReviewTargetTypeConstraint();

        if (!hotelReviewsCsv.exists() || reviewRepository.existsByTargetType(ReviewTargetType.HOTEL)) {
            return;
        }

        Map<String, String> hotelNamesById = loadHotelNames();

        List<Review> reviews = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(hotelReviewsCsv.getInputStream(), StandardCharsets.UTF_8))) {
            reader.readLine();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }

                String[] values = line.split("\t", -1);
                if (values.length < 5 || values[3].isBlank()) {
                    continue;
                }

                Instant createdAt = readCreatedAt(values[4]);
                reviews.add(Review.builder()
                        .id(Long.parseLong(values[0]))
                        .targetType(ReviewTargetType.HOTEL)
                        .targetId(values[1])
                        .targetName(hotelNamesById.getOrDefault(values[1], ""))
                        .rating(normalizeRating(Double.parseDouble(values[2])))
                        .content(values[3])
                        .category(CommunityCategory.HOTEL)
                        .authorUserId(SYSTEM_AUTHOR_ID)
                        .authorName(SYSTEM_AUTHOR_NAME)
                        .createdAt(createdAt)
                        .updatedAt(createdAt)
                        .build());
            }
        }

        if (!reviews.isEmpty()) {
            reviewRepository.saveAll(reviews);
        }
    }

    private Map<String, String> loadHotelNames() throws Exception {
        Map<String, String> namesById = new HashMap<>();
        if (!hotelsCsv.exists()) {
            return namesById;
        }
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(hotelsCsv.getInputStream(), StandardCharsets.UTF_8))) {
            reader.readLine();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                String[] values = line.split("\t", -1);
                if (values.length >= 2) {
                    namesById.put(values[0], values[1]);
                }
            }
        }
        return namesById;
    }

    private void updateReviewTargetTypeConstraint() {
        try {
            jdbcTemplate.execute("alter table if exists review drop constraint if exists review_target_type_check");
            jdbcTemplate.execute("""
                    alter table if exists review
                    add constraint review_target_type_check
                    check (target_type in ('SCENIC_SPOT', 'ROUTE', 'MERCHANT', 'HOTEL'))
                    """);
        } catch (RuntimeException ignored) {
            // H2 or a manually managed schema may not expose the Hibernate-generated check constraint.
        }
    }

    private Instant readCreatedAt(String time) {
        if (time.isBlank()) {
            return Instant.now();
        }
        try {
            return LocalDateTime.parse(time).toInstant(ZoneOffset.UTC);
        } catch (RuntimeException ignored) {
            return Instant.now();
        }
    }

    private int normalizeRating(double rating) {
        return Math.max(1, Math.min(5, (int) Math.round(rating)));
    }
}
