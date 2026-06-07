package org.microarchitecturovisco.communityservice.service;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.CommunityPost;
import org.microarchitecturovisco.communityservice.domain.PostLike;
import org.microarchitecturovisco.communityservice.domain.Review;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;
import org.microarchitecturovisco.communityservice.dto.CommunitySummaryResponse;
import org.microarchitecturovisco.communityservice.dto.CreatePostRequest;
import org.microarchitecturovisco.communityservice.dto.CreateReviewRequest;
import org.microarchitecturovisco.communityservice.dto.LikeResponse;
import org.microarchitecturovisco.communityservice.dto.PostResponse;
import org.microarchitecturovisco.communityservice.dto.ReviewResponse;
import org.microarchitecturovisco.communityservice.dto.UserProfileResponse;
import org.microarchitecturovisco.communityservice.repository.CommunityPostRepository;
import org.microarchitecturovisco.communityservice.repository.PostLikeRepository;
import org.microarchitecturovisco.communityservice.repository.ReviewRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CommunityService {

    private final CommunityPostRepository postRepository;
    private final PostLikeRepository likeRepository;
    private final ReviewRepository reviewRepository;
    private final UserClient userClient;

    public Page<PostResponse> listPosts(CommunityCategory category, String keyword, int page, int size, String sort, String token) {
        Pageable pageable = PageRequest.of(
                Math.max(0, page),
                Math.min(Math.max(size, 1), 50),
                "popular".equalsIgnoreCase(sort)
                        ? Sort.by(Sort.Direction.DESC, "likeCount").and(Sort.by(Sort.Direction.DESC, "createdAt"))
                        : Sort.by(Sort.Direction.DESC, "createdAt")
        );
        UUID currentUserId = tryResolveUserId(token);
        String normalizedKeyword = normalizeKeyword(keyword);
        Page<CommunityPost> posts = normalizedKeyword == null
                ? (category == null ? postRepository.findAll(pageable) : postRepository.findByCategory(category, pageable))
                : postRepository.search(category, normalizedKeyword, pageable);
        return posts
                .map(post -> PostResponse.from(post, currentUserId != null && likeRepository.existsByPostIdAndUserId(post.getId(), currentUserId)));
    }

    public PostResponse getPost(UUID postId, String token) {
        CommunityPost post = requirePost(postId);
        UUID currentUserId = tryResolveUserId(token);
        return PostResponse.from(post, currentUserId != null && likeRepository.existsByPostIdAndUserId(post.getId(), currentUserId));
    }

    public PostResponse createPost(String token, CreatePostRequest request) {
        UserProfileResponse user = userClient.requireUser(token);
        CommunityPost post = CommunityPost.builder()
                .id(UUID.randomUUID())
                .title(request.title().trim())
                .content(request.content().trim())
                .category(request.category())
                .destination(normalizeOptional(request.destination()))
                .imageUrls(normalizeImageUrls(request.imageUrls()))
                .authorUserId(user.id())
                .authorName(user.displayName())
                .likeCount(0)
                .build();

        return PostResponse.from(postRepository.save(post), false);
    }

    @Transactional
    public LikeResponse toggleLike(String token, UUID postId) {
        UserProfileResponse user = userClient.requireUser(token);
        CommunityPost post = requirePost(postId);
        return likeRepository.findByPostIdAndUserId(postId, user.id())
                .map(existingLike -> {
                    likeRepository.delete(existingLike);
                    post.setLikeCount(Math.max(0, post.getLikeCount() - 1));
                    return new LikeResponse(post.getId(), false, postRepository.save(post).getLikeCount());
                })
                .orElseGet(() -> {
                    likeRepository.save(PostLike.builder()
                            .id(UUID.randomUUID())
                            .postId(postId)
                            .userId(user.id())
                            .createdAt(Instant.now())
                            .build());
                    post.setLikeCount(post.getLikeCount() + 1);
                    return new LikeResponse(post.getId(), true, postRepository.save(post).getLikeCount());
                });
    }

    public Page<ReviewResponse> listReviews(ReviewTargetType targetType, String targetId, CommunityCategory category, int page, int size) {
        Pageable pageable = PageRequest.of(
                Math.max(0, page),
                Math.min(Math.max(size, 1), 50),
                Sort.by(Sort.Direction.DESC, "createdAt")
        );
        return reviewRepository.search(targetType, normalizeOptional(targetId), category, pageable)
                .map(ReviewResponse::from);
    }

    public ReviewResponse createReview(String token, CreateReviewRequest request) {
        UserProfileResponse user = userClient.requireUser(token);
        Review review = Review.builder()
                .id(UUID.randomUUID())
                .targetType(request.targetType())
                .targetId(normalizeOptional(request.targetId()))
                .targetName(request.targetName().trim())
                .rating(request.rating())
                .content(request.content().trim())
                .category(request.category())
                .authorUserId(user.id())
                .authorName(user.displayName())
                .build();

        return ReviewResponse.from(reviewRepository.save(review));
    }

    public CommunitySummaryResponse getSummary(ReviewTargetType targetType, String targetId) {
        if (targetType == null || normalizeOptional(targetId) == null) {
            return new CommunitySummaryResponse(targetType, normalizeOptional(targetId), 0, 0, List.of());
        }
        String normalizedTargetId = normalizeOptional(targetId);
        return new CommunitySummaryResponse(
                targetType,
                normalizedTargetId,
                Math.round(reviewRepository.averageRating(targetType, normalizedTargetId) * 10.0) / 10.0,
                reviewRepository.countByTargetTypeAndTargetId(targetType, normalizedTargetId),
                reviewRepository.findTop5ByTargetTypeAndTargetIdOrderByCreatedAtDesc(targetType, normalizedTargetId)
                        .stream()
                        .map(ReviewResponse::from)
                        .toList()
        );
    }

    private CommunityPost requirePost(UUID postId) {
        return postRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Community post not found"));
    }

    private UUID tryResolveUserId(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        try {
            return userClient.requireUser(token).id();
        } catch (ResponseStatusException e) {
            return null;
        }
    }

    private String normalizeKeyword(String value) {
        String normalized = normalizeOptional(value);
        return normalized == null ? null : normalized;
    }

    private String normalizeOptional(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }

    private List<String> normalizeImageUrls(List<String> imageUrls) {
        if (imageUrls == null) {
            return List.of();
        }
        return imageUrls.stream()
                .map(this::normalizeOptional)
                .filter(url -> url != null && (url.startsWith("http://") || url.startsWith("https://")))
                .limit(6)
                .toList();
    }
}
