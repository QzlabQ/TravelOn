package org.microarchitecturovisco.communityservice;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.CommunityPost;
import org.microarchitecturovisco.communityservice.domain.PostLike;
import org.microarchitecturovisco.communityservice.domain.Review;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;
import org.microarchitecturovisco.communityservice.dto.CreatePostRequest;
import org.microarchitecturovisco.communityservice.dto.CreateReviewRequest;
import org.microarchitecturovisco.communityservice.dto.LikeResponse;
import org.microarchitecturovisco.communityservice.dto.PostResponse;
import org.microarchitecturovisco.communityservice.dto.ReviewResponse;
import org.microarchitecturovisco.communityservice.dto.UserProfileResponse;
import org.microarchitecturovisco.communityservice.repository.CommunityPostRepository;
import org.microarchitecturovisco.communityservice.repository.PostLikeRepository;
import org.microarchitecturovisco.communityservice.repository.ReviewRepository;
import org.microarchitecturovisco.communityservice.service.CommunityService;
import org.microarchitecturovisco.communityservice.service.UserClient;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

class CommunityServiceTest {

    private CommunityPostRepository postRepository;
    private PostLikeRepository likeRepository;
    private ReviewRepository reviewRepository;
    private UserClient userClient;
    private CommunityService communityService;
    private UserProfileResponse user;

    @BeforeEach
    void setUp() {
        postRepository = mock(CommunityPostRepository.class);
        likeRepository = mock(PostLikeRepository.class);
        reviewRepository = mock(ReviewRepository.class);
        userClient = mock(UserClient.class);
        communityService = new CommunityService(postRepository, likeRepository, reviewRepository, userClient);
        user = new UserProfileResponse(UUID.randomUUID(), "ada@example.com", "Ada", "Lovelace", null, null, "Explorer", Instant.now(), Instant.now(), Instant.now());
    }

    @Test
    void createsPostForAuthenticatedUser() {
        when(userClient.requireUser("token")).thenReturn(user);
        when(postRepository.save(any(CommunityPost.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PostResponse response = communityService.createPost("token", new CreatePostRequest(
                "Shanghai weekend",
                "A compact route with museums and food.",
                CommunityCategory.TRAVEL_NOTE,
                "Shanghai",
                List.of("https://example.com/photo.jpg", "ftp://ignored.example.com/photo.jpg")
        ));

        assertThat(response.title()).isEqualTo("Shanghai weekend");
        assertThat(response.authorUserId()).isEqualTo(user.id());
        assertThat(response.authorName()).isEqualTo("Ada Lovelace");
        assertThat(response.imageUrls()).containsExactly("https://example.com/photo.jpg");
    }

    @Test
    void rejectsPostCreationWithoutAuthenticatedUser() {
        when(userClient.requireUser("bad-token")).thenThrow(new ResponseStatusException(UNAUTHORIZED, "Invalid session token"));

        assertThatThrownBy(() -> communityService.createPost("bad-token", new CreatePostRequest(
                "Title",
                "Content",
                CommunityCategory.TRAVEL_NOTE,
                null,
                List.of()
        ))).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void searchesPostsByCategoryAndKeyword() {
        CommunityPost post = post("Suzhou gardens");
        when(postRepository.search(eq(CommunityCategory.TRAVEL_NOTE), eq("Suzhou"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(post)));

        List<PostResponse> posts = communityService.listPosts(CommunityCategory.TRAVEL_NOTE, " Suzhou ", 0, 12, "latest", null)
                .getContent();

        assertThat(posts).hasSize(1);
        assertThat(posts.get(0).title()).isEqualTo("Suzhou gardens");
    }

    @Test
    void togglesLikeWithoutDoubleCounting() {
        CommunityPost post = post("Liked post");
        when(userClient.requireUser("token")).thenReturn(user);
        when(postRepository.findById(post.getId())).thenReturn(Optional.of(post));
        when(postRepository.save(any(CommunityPost.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(likeRepository.findByPostIdAndUserId(post.getId(), user.id())).thenReturn(Optional.empty());

        LikeResponse liked = communityService.toggleLike("token", post.getId());

        assertThat(liked.liked()).isTrue();
        assertThat(liked.likeCount()).isEqualTo(1);

        PostLike existingLike = PostLike.builder().id(UUID.randomUUID()).postId(post.getId()).userId(user.id()).createdAt(Instant.now()).build();
        when(likeRepository.findByPostIdAndUserId(post.getId(), user.id())).thenReturn(Optional.of(existingLike));

        LikeResponse unliked = communityService.toggleLike("token", post.getId());

        assertThat(unliked.liked()).isFalse();
        assertThat(unliked.likeCount()).isEqualTo(0);
        verify(likeRepository).delete(existingLike);
    }

    @Test
    void createsReviewForTarget() {
        when(userClient.requireUser("token")).thenReturn(user);
        when(reviewRepository.save(any(Review.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ReviewResponse response = communityService.createReview("token", new CreateReviewRequest(
                ReviewTargetType.SCENIC_SPOT,
                "poi-1",
                "West Lake",
                5,
                "Great view and clear signs.",
                CommunityCategory.SCENIC_SPOT
        ));

        assertThat(response.targetType()).isEqualTo(ReviewTargetType.SCENIC_SPOT);
        assertThat(response.targetId()).isEqualTo("poi-1");
        assertThat(response.rating()).isEqualTo(5);
        assertThat(response.authorName()).isEqualTo("Ada Lovelace");
    }

    private CommunityPost post(String title) {
        return CommunityPost.builder()
                .id(UUID.randomUUID())
                .title(title)
                .content("Content")
                .category(CommunityCategory.TRAVEL_NOTE)
                .destination("Suzhou")
                .imageUrls(List.of())
                .authorUserId(user.id())
                .authorName("Ada Lovelace")
                .likeCount(0)
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();
    }
}
