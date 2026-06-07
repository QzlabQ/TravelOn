package org.microarchitecturovisco.communityservice.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;
import org.microarchitecturovisco.communityservice.dto.CommunitySummaryResponse;
import org.microarchitecturovisco.communityservice.dto.CreatePostRequest;
import org.microarchitecturovisco.communityservice.dto.CreateReviewRequest;
import org.microarchitecturovisco.communityservice.dto.LikeResponse;
import org.microarchitecturovisco.communityservice.dto.PostResponse;
import org.microarchitecturovisco.communityservice.dto.ReviewResponse;
import org.microarchitecturovisco.communityservice.service.CommunityService;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/community")
public class CommunityController {

    private final CommunityService communityService;

    @GetMapping("/posts")
    public Page<PostResponse> listPosts(
            @RequestParam(required = false) CommunityCategory category,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @RequestParam(defaultValue = "latest") String sort,
            @RequestHeader(value = "X-User-Token", required = false) String token
    ) {
        return communityService.listPosts(category, keyword, page, size, sort, token);
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
            @RequestParam(defaultValue = "12") int size
    ) {
        return communityService.listReviews(targetType, targetId, category, page, size);
    }

    @PostMapping("/reviews")
    @ResponseStatus(HttpStatus.CREATED)
    public ReviewResponse createReview(
            @RequestHeader(value = "X-User-Token", required = false) String token,
            @Valid @RequestBody CreateReviewRequest request
    ) {
        return communityService.createReview(token, request);
    }

    @GetMapping("/summary")
    public CommunitySummaryResponse getSummary(
            @RequestParam(required = false) ReviewTargetType targetType,
            @RequestParam(required = false) String targetId
    ) {
        return communityService.getSummary(targetType, targetId);
    }
}
