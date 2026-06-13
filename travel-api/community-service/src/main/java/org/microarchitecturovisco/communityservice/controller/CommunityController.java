package org.microarchitecturovisco.communityservice.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;
import org.microarchitecturovisco.communityservice.dto.AttractionDetailResponse;
import org.microarchitecturovisco.communityservice.dto.AttractionResponse;
import org.microarchitecturovisco.communityservice.dto.CommentLikeResponse;
import org.microarchitecturovisco.communityservice.dto.CommentResponse;
import org.microarchitecturovisco.communityservice.dto.CommunitySummaryResponse;
import org.microarchitecturovisco.communityservice.dto.CreateAttractionRequest;
import org.microarchitecturovisco.communityservice.dto.CreateAttractionReviewRequest;
import org.microarchitecturovisco.communityservice.dto.CreateCommentRequest;
import org.microarchitecturovisco.communityservice.dto.CreatePostRequest;
import org.microarchitecturovisco.communityservice.dto.CreateReviewRequest;
import org.microarchitecturovisco.communityservice.dto.FavoriteResponse;
import org.microarchitecturovisco.communityservice.dto.LikeResponse;
import org.microarchitecturovisco.communityservice.dto.PostResponse;
import org.microarchitecturovisco.communityservice.dto.CreateTravelRouteRequest;
import org.microarchitecturovisco.communityservice.dto.ReviewLikeResponse;
import org.microarchitecturovisco.communityservice.dto.ReviewResponse;
import org.microarchitecturovisco.communityservice.dto.ToggleFavoriteRequest;
import org.microarchitecturovisco.communityservice.dto.TravelRouteDetailResponse;
import org.microarchitecturovisco.communityservice.dto.TravelRouteResponse;
import org.microarchitecturovisco.communityservice.dto.UploadResponse;
import org.microarchitecturovisco.communityservice.domain.FavoriteTargetType;
import org.microarchitecturovisco.communityservice.service.AttractionService;
import org.microarchitecturovisco.communityservice.service.CommentService;
import org.microarchitecturovisco.communityservice.service.CommunityService;
import org.microarchitecturovisco.communityservice.service.FavoriteService;
import org.microarchitecturovisco.communityservice.service.FileStorageService;
import org.microarchitecturovisco.communityservice.service.ProfileService;
import org.microarchitecturovisco.communityservice.service.ReviewLikeService;
import org.microarchitecturovisco.communityservice.service.TravelRouteService;

import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/community")
public class CommunityController {

    private final CommunityService communityService;
    private final AttractionService attractionService;
    private final TravelRouteService travelRouteService;
    private final FileStorageService fileStorageService;
    private final FavoriteService favoriteService;
    private final CommentService commentService;
    private final ReviewLikeService reviewLikeService;
    private final ProfileService profileService;

    @GetMapping("/posts")
    public Page<PostResponse> listPosts(
            @RequestParam(required = false) CommunityCategory category,
            @RequestParam(required = false) String cityId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @RequestParam(defaultValue = "latest") String sort,
            @RequestHeader(value = "X-User-Token", required = false) String token
    ) {
        return communityService.listPosts(category, cityId, keyword, page, size, sort, token);
    }

    @PostMapping("/posts")
    @ResponseStatus(HttpStatus.CREATED)
    public PostResponse createPost(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @Valid @RequestBody CreatePostRequest request
    ) {
        return communityService.createPost(token, request);
    }

    @GetMapping("/posts/{postId}")
    public PostResponse getPost(
            @PathVariable UUID postId,
            @RequestHeader(value = "X-User-Token", required = false) String token
    ) {
        return communityService.getPost(postId, token);
    }

    @DeleteMapping("/posts/{postId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePost(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @PathVariable UUID postId
    ) {
        communityService.deletePost(token, postId);
    }

    @PostMapping("/posts/{postId}/likes")
    public LikeResponse toggleLike(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @PathVariable UUID postId
    ) {
        return communityService.toggleLike(token, postId);
    }

    @GetMapping("/reviews")
    public Page<ReviewResponse> listReviews(
            @RequestParam(required = false) ReviewTargetType targetType,
            @RequestParam(required = false) String targetId,
            @RequestParam(required = false) CommunityCategory category,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @RequestHeader(value = "X-User-Token", required = false) String token
    ) {
        return communityService.listReviews(targetType, targetId, category, page, size, token);
    }

    @PostMapping("/reviews")
    @ResponseStatus(HttpStatus.CREATED)
    public ReviewResponse createReview(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @Valid @RequestBody CreateReviewRequest request
    ) {
        return communityService.createReview(token, request);
    }

    @PostMapping("/uploads")
    @ResponseStatus(HttpStatus.CREATED)
    public UploadResponse uploadImage(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @RequestPart("file") MultipartFile file
    ) {
        return new UploadResponse(fileStorageService.store(file));
    }

    @GetMapping("/summary")
    public CommunitySummaryResponse getSummary(
            @RequestParam(required = false) ReviewTargetType targetType,
            @RequestParam(required = false) String targetId
    ) {
        return communityService.getSummary(targetType, targetId);
    }

    // ── Attraction endpoints ──────────────────────────────────────────────────

    @GetMapping("/attractions")
    public Page<AttractionResponse> listAttractions(
            @RequestParam(required = false) String cityId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "popular") String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size
    ) {
        return attractionService.list(cityId, keyword, sort, page, size);
    }

    @PostMapping("/attractions")
    @ResponseStatus(HttpStatus.CREATED)
    public AttractionResponse createAttraction(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @Valid @RequestBody CreateAttractionRequest request
    ) {
        return attractionService.create(token, request);
    }

    @GetMapping("/attractions/{attractionId}")
    public AttractionDetailResponse getAttraction(
            @PathVariable UUID attractionId,
            @RequestHeader(value = "X-User-Token", required = false) String token
    ) {
        return attractionService.getDetail(attractionId, token);
    }

    @PutMapping("/attractions/{attractionId}")
    public AttractionResponse updateAttraction(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @PathVariable UUID attractionId,
            @Valid @RequestBody CreateAttractionRequest request
    ) {
        return attractionService.update(token, attractionId, request);
    }

    @DeleteMapping("/attractions/{attractionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAttraction(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @PathVariable UUID attractionId
    ) {
        attractionService.delete(token, attractionId);
    }

    @PostMapping("/attractions/{attractionId}/reviews")
    @ResponseStatus(HttpStatus.CREATED)
    public ReviewResponse createAttractionReview(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @PathVariable UUID attractionId,
            @Valid @RequestBody CreateAttractionReviewRequest request
    ) {
        return attractionService.createReview(token, attractionId, request);
    }

    // ── Travel route endpoints ────────────────────────────────────────────────

    @GetMapping("/routes")
    public Page<TravelRouteResponse> listRoutes(
            @RequestParam(required = false) String style,
            @RequestParam(required = false) String cityId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "latest") String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size
    ) {
        return travelRouteService.list(style, cityId, keyword, sort, page, size);
    }

    @PostMapping("/routes")
    @ResponseStatus(HttpStatus.CREATED)
    public TravelRouteResponse createRoute(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @Valid @RequestBody CreateTravelRouteRequest request
    ) {
        return travelRouteService.create(token, request);
    }

    @GetMapping("/routes/{routeId}")
    public TravelRouteDetailResponse getRoute(
            @PathVariable UUID routeId,
            @RequestHeader(value = "X-User-Token", required = false) String token
    ) {
        return travelRouteService.getDetail(routeId, token);
    }

    // Published routes are immutable: there is intentionally no update endpoint —
    // a route can only be created or deleted, never edited (by anyone, including admins).

    @DeleteMapping("/routes/{routeId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteRoute(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @PathVariable UUID routeId
    ) {
        travelRouteService.delete(token, routeId);
    }

    @PostMapping("/routes/{routeId}/reviews")
    @ResponseStatus(HttpStatus.CREATED)
    public ReviewResponse createRouteReview(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @PathVariable UUID routeId,
            @Valid @RequestBody CreateAttractionReviewRequest request
    ) {
        return travelRouteService.createReview(token, routeId, request);
    }

    // ── Favorites ─────────────────────────────────────────────────────────────

    @PostMapping("/favorites/toggle")
    public FavoriteResponse toggleFavorite(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @Valid @RequestBody ToggleFavoriteRequest request
    ) {
        return favoriteService.toggle(token, request.type(), request.targetId());
    }

    @GetMapping("/favorites/status")
    public FavoriteResponse favoriteStatus(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @RequestParam FavoriteTargetType type,
            @RequestParam String targetId
    ) {
        return favoriteService.status(token, type, targetId);
    }

    // ── Post comments ───────────────────────────────────────────────────────────

    @GetMapping("/posts/{postId}/comments")
    public List<CommentResponse> listPostComments(
            @PathVariable UUID postId,
            @RequestParam(defaultValue = "likes") String sort,
            @RequestHeader(value = "X-User-Token", required = false) String token
    ) {
        return commentService.listPostComments(postId, sort, token);
    }

    @PostMapping("/posts/{postId}/comments")
    @ResponseStatus(HttpStatus.CREATED)
    public CommentResponse addPostComment(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @PathVariable UUID postId,
            @Valid @RequestBody CreateCommentRequest request
    ) {
        return commentService.addPostComment(token, postId, request);
    }

    @PostMapping("/posts/{postId}/comments/{commentId}/likes")
    public CommentLikeResponse togglePostCommentLike(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @PathVariable UUID postId,
            @PathVariable UUID commentId
    ) {
        return commentService.togglePostCommentLike(token, postId, commentId);
    }

    @DeleteMapping("/posts/{postId}/comments/{commentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePostComment(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @PathVariable UUID postId,
            @PathVariable UUID commentId
    ) {
        commentService.deletePostComment(token, postId, commentId);
    }

    // ── Review likes ──────────────────────────────────────────────────────────

    @PostMapping("/reviews/{reviewId}/likes")
    public ReviewLikeResponse toggleReviewLike(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @PathVariable Long reviewId
    ) {
        return reviewLikeService.toggle(token, reviewId);
    }

    @DeleteMapping("/reviews/{reviewId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteReview(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @PathVariable Long reviewId
    ) {
        reviewLikeService.delete(token, reviewId);
    }

    // ── "我的" (current user's content & favorites) ──────────────────────────────

    @GetMapping("/me/posts")
    public List<PostResponse> myPosts(@RequestHeader(value = "X-User-Token", required = false) String token) {
        return profileService.myPosts(token);
    }

    @GetMapping("/me/routes")
    public List<TravelRouteResponse> myRoutes(@RequestHeader(value = "X-User-Token", required = false) String token) {
        return profileService.myRoutes(token);
    }

    @GetMapping("/me/reviews")
    public List<ReviewResponse> myReviews(@RequestHeader(value = "X-User-Token", required = false) String token) {
        return profileService.myReviews(token);
    }

    @GetMapping("/me/favorites/posts")
    public List<PostResponse> myFavoritePosts(@RequestHeader(value = "X-User-Token", required = false) String token) {
        return profileService.myFavoritePosts(token);
    }

    @GetMapping("/me/favorites/routes")
    public List<TravelRouteResponse> myFavoriteRoutes(@RequestHeader(value = "X-User-Token", required = false) String token) {
        return profileService.myFavoriteRoutes(token);
    }

    @GetMapping("/me/favorites/attractions")
    public List<AttractionResponse> myFavoriteAttractions(@RequestHeader(value = "X-User-Token", required = false) String token) {
        return profileService.myFavoriteAttractions(token);
    }
}
