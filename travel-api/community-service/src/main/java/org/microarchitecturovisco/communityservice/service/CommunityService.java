package org.microarchitecturovisco.communityservice.service;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.communityservice.domain.City;
import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.CommunityPost;
import org.microarchitecturovisco.communityservice.domain.FavoriteTargetType;
import org.microarchitecturovisco.communityservice.domain.PostLike;
import org.microarchitecturovisco.communityservice.domain.PostContentFormat;
import org.microarchitecturovisco.communityservice.domain.Review;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;
import org.microarchitecturovisco.communityservice.dto.CommunitySummaryResponse;
import org.microarchitecturovisco.communityservice.dto.CreatePostRequest;
import org.microarchitecturovisco.communityservice.dto.CreateReviewRequest;
import org.microarchitecturovisco.communityservice.dto.LikeResponse;
import org.microarchitecturovisco.communityservice.dto.PostResponse;
import org.microarchitecturovisco.communityservice.dto.ReviewResponse;
import org.microarchitecturovisco.communityservice.dto.UserProfileResponse;
import org.microarchitecturovisco.communityservice.repository.CityRepository;
import org.microarchitecturovisco.communityservice.repository.CommentLikeRepository;
import org.microarchitecturovisco.communityservice.repository.CommunityCommentRepository;
import org.microarchitecturovisco.communityservice.repository.CommunityPostRepository;
import org.microarchitecturovisco.communityservice.repository.FavoriteRepository;
import org.microarchitecturovisco.communityservice.repository.PostLikeRepository;
import org.microarchitecturovisco.communityservice.repository.ReviewRepository;
import org.microarchitecturovisco.communityservice.util.CommunityImages;
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
    private final CityRepository cityRepository;
    private final UserClient userClient;
    private final FavoriteService favoriteService;
    private final CommentService commentService;
    private final ReviewLikeService reviewLikeService;
    private final FavoriteRepository favoriteRepository;
    private final CommunityCommentRepository commentRepository;
    private final CommentLikeRepository commentLikeRepository;

    public Page<PostResponse> listPosts(CommunityCategory category, String cityId, String keyword, int page, int size, String sort, String token) {
        Pageable pageable = PageRequest.of(
                Math.max(0, page),
                Math.min(Math.max(size, 1), 50),
                "popular".equalsIgnoreCase(sort)
                        ? Sort.by(Sort.Direction.DESC, "likeCount").and(Sort.by(Sort.Direction.DESC, "createdAt"))
                        : Sort.by(Sort.Direction.DESC, "createdAt")
        );
        UUID currentUserId = tryResolveUserId(token);
        String normalizedCityId = normalizeOptional(cityId);
        String normalizedKeyword = normalizeKeyword(keyword);
        Page<CommunityPost> posts = postRepository.findFiltered(category, normalizedCityId, normalizedKeyword, pageable);
        return posts.map(post -> toPostResponse(post, currentUserId));
    }

    public PostResponse getPost(UUID postId, String token) {
        CommunityPost post = requirePost(postId);
        return toPostResponse(post, tryResolveUserId(token));
    }

    private PostResponse toPostResponse(CommunityPost post, UUID currentUserId) {
        boolean liked = currentUserId != null && likeRepository.existsByPostIdAndUserId(post.getId(), currentUserId);
        boolean favorited = favoriteService.isFavorited(currentUserId, FavoriteTargetType.POST, post.getId().toString());
        long commentCount = commentService.countPostComments(post.getId());
        return PostResponse.from(post, liked, favorited, commentCount);
    }

    public PostResponse createPost(String token, CreatePostRequest request) {
        UserProfileResponse user = userClient.requireUser(token);
        String normalizedCityId = normalizeOptional(request.destinationCityId());
        City destinationCity = normalizedCityId != null
                ? cityRepository.findByCityId(normalizedCityId).orElse(null)
                : null;
        CommunityPost post = CommunityPost.builder()
                .id(UUID.randomUUID())
                .title(request.title().trim())
                .content(request.content().trim())
                .contentFormat(request.contentFormat() == null ? PostContentFormat.PLAIN_TEXT : request.contentFormat())
                .category(request.category())
                .destinationCity(destinationCity)
                .associatedTargetType(request.associatedTargetType())
                .associatedTargetId(normalizeOptional(request.associatedTargetId()))
                .associatedTargetName(normalizeOptional(request.associatedTargetName()))
                .imageUrls(CommunityImages.normalize(request.imageUrls()))
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
                    return new LikeResponse(post.getId(), false, Math.toIntExact(likeRepository.countByPostId(postId)));
                })
                .orElseGet(() -> {
                    likeRepository.save(PostLike.builder()
                            .id(UUID.randomUUID())
                            .postId(postId)
                            .userId(user.id())
                            .createdAt(Instant.now())
                            .build());
                    return new LikeResponse(post.getId(), true, Math.toIntExact(likeRepository.countByPostId(postId)));
                });
    }

    public Page<ReviewResponse> listReviews(ReviewTargetType targetType, String targetId, CommunityCategory category, int page, int size, String token) {
        Pageable pageable = PageRequest.of(
                Math.max(0, page),
                Math.min(Math.max(size, 1), 50),
                Sort.by(Sort.Direction.DESC, "createdAt")
        );
        UUID currentUserId = tryResolveUserId(token);
        Page<Review> reviews = reviewRepository.search(targetType, normalizeOptional(targetId), category, pageable);
        List<ReviewResponse> responses = reviewLikeService.toResponses(reviews.getContent(), currentUserId);
        return reviews.map(review -> responses.stream()
                .filter(response -> response.id().equals(review.getId()))
                .findFirst()
                .orElseGet(() -> ReviewResponse.from(review)));
    }

    public ReviewResponse createReview(String token, CreateReviewRequest request) {
        UserProfileResponse user = userClient.requireUser(token);
        Review review = Review.builder()
                .id(reviewRepository.findMaxId() + 1)
                .targetType(request.targetType())
                .targetId(normalizeOptional(request.targetId()))
                .targetName(request.targetName().trim())
                .rating(request.rating())
                .content(request.content().trim())
                .category(request.category())
                .imageUrls(CommunityImages.normalize(request.imageUrls()))
                .authorUserId(user.id())
                .authorName(user.displayName())
                .build();

        return ReviewResponse.from(reviewRepository.save(review));
    }

    @Transactional
    public void deletePost(String token, UUID postId) {
        CommunityPost post = requirePost(postId);
        userClient.requireOwnerOrAdmin(token, post.getAuthorUserId());
        List<UUID> commentIds = commentRepository.findByTargetTypeAndTargetIdOrderByCreatedAtDesc(
                        FavoriteTargetType.POST, postId.toString())
                .stream()
                .map(comment -> comment.getId())
                .toList();
        if (!commentIds.isEmpty()) {
            commentLikeRepository.deleteByCommentIdIn(commentIds);
        }
        commentRepository.deleteByTargetTypeAndTargetId(FavoriteTargetType.POST, postId.toString());
        likeRepository.deleteByPostId(postId);
        favoriteRepository.deleteByTypeAndTargetId(FavoriteTargetType.POST, postId.toString());
        postRepository.delete(post);
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
}
