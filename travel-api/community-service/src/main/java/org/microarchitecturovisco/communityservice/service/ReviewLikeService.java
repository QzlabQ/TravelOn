package org.microarchitecturovisco.communityservice.service;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.communityservice.domain.Review;
import org.microarchitecturovisco.communityservice.domain.ReviewLike;
import org.microarchitecturovisco.communityservice.dto.ReviewLikeResponse;
import org.microarchitecturovisco.communityservice.dto.ReviewResponse;
import org.microarchitecturovisco.communityservice.dto.UserProfileResponse;
import org.microarchitecturovisco.communityservice.repository.ReviewLikeRepository;
import org.microarchitecturovisco.communityservice.repository.ReviewLikeCount;
import org.microarchitecturovisco.communityservice.repository.ReviewRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ReviewLikeService {

    private final ReviewLikeRepository reviewLikeRepository;
    private final ReviewRepository reviewRepository;
    private final UserClient userClient;

    @Transactional
    public ReviewLikeResponse toggle(String token, Long reviewId) {
        UserProfileResponse user = userClient.requireUser(token);
        reviewRepository.findById(reviewId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Review not found"));

        return reviewLikeRepository.findByReviewIdAndUserId(reviewId, user.id())
                .map(existing -> {
                    reviewLikeRepository.delete(existing);
                    return new ReviewLikeResponse(reviewId, false, (int) reviewLikeRepository.countByReviewId(reviewId));
                })
                .orElseGet(() -> {
                    reviewLikeRepository.save(ReviewLike.builder()
                            .id(UUID.randomUUID())
                            .reviewId(reviewId)
                            .userId(user.id())
                            .createdAt(Instant.now())
                            .build());
                    return new ReviewLikeResponse(reviewId, true, (int) reviewLikeRepository.countByReviewId(reviewId));
                });
    }

    /** Deletes a review (and its likes). Allowed for the review author or an admin. */
    @Transactional
    public void delete(String token, Long reviewId) {
        Review review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Review not found"));
        userClient.requireOwnerOrAdmin(token, review.getAuthorUserId());
        reviewLikeRepository.deleteByReviewId(reviewId);
        reviewRepository.delete(review);
    }

    /** Maps reviews to responses, filling like count and whether {@code currentUserId} liked each. */
    public List<ReviewResponse> toResponses(List<Review> reviews, UUID currentUserId) {
        if (reviews.isEmpty()) {
            return List.of();
        }
        List<Long> ids = reviews.stream().map(Review::getId).toList();
        Set<Long> likedByMe = currentUserId == null
                ? Set.of()
                : reviewLikeRepository.findByUserIdAndReviewIdIn(currentUserId, ids).stream()
                        .map(ReviewLike::getReviewId)
                        .collect(Collectors.toSet());
        Map<Long, Long> counts = reviewLikeRepository.countByReviewIdIn(ids).stream()
                .collect(Collectors.toMap(ReviewLikeCount::getReviewId, ReviewLikeCount::getLikeCount));
        return reviews.stream()
                .map(review -> ReviewResponse.from(
                        review,
                        Math.toIntExact(counts.getOrDefault(review.getId(), 0L)),
                        likedByMe.contains(review.getId())))
                .toList();
    }
}
