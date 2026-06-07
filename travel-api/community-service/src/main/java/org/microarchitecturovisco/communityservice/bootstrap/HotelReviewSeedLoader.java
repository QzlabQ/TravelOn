package org.microarchitecturovisco.communityservice.bootstrap;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.Review;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;
import org.microarchitecturovisco.communityservice.repository.ReviewRepository;
import org.springframework.beans.factory.annotation.Value;
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
import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class HotelReviewSeedLoader implements CommandLineRunner {

    private static final UUID SYSTEM_AUTHOR_ID = UUID.nameUUIDFromBytes("system:hotel-seed-reviewer".getBytes(StandardCharsets.UTF_8));
    private static final String SYSTEM_AUTHOR_NAME = "Seed Traveler";

    private final ReviewRepository reviewRepository;
    private final JdbcTemplate jdbcTemplate;

    @Value("${app.seed-data.hotel-reviews-csv:file:seed-data/hotel/hotel_reviews.csv}")
    private Resource hotelReviewsCsv;

    @Override
    public void run(String... args) throws Exception {
        updateReviewTargetTypeConstraint();

        if (!hotelReviewsCsv.exists() || reviewRepository.existsByTargetType(ReviewTargetType.HOTEL)) {
            return;
        }

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
                if (values.length < 6 || values[4].isBlank()) {
                    continue;
                }

                Instant createdAt = readCreatedAt(values[5]);
                reviews.add(Review.builder()
                        .id(UUID.fromString(values[0]))
                        .targetType(ReviewTargetType.HOTEL)
                        .targetId(values[1])
                        .targetName(values[2])
                        .rating(normalizeRating(Double.parseDouble(values[3])))
                        .content(values[4])
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
