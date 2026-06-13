package org.microarchitecturovisco.communityservice;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.communityservice.domain.City;
import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.CommunityPost;
import org.microarchitecturovisco.communityservice.domain.PostContentFormat;
import org.microarchitecturovisco.communityservice.domain.PostLike;
import org.microarchitecturovisco.communityservice.domain.Review;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;
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
import org.microarchitecturovisco.communityservice.service.CommunityService;
import org.microarchitecturovisco.communityservice.service.CommentService;
import org.microarchitecturovisco.communityservice.service.FavoriteService;
import org.microarchitecturovisco.communityservice.service.ReviewLikeService;
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
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

class CommunityServiceTest {

    private CommunityPostRepository postRepository;
    private PostLikeRepository likeRepository;
    private ReviewRepository reviewRepository;
    private CityRepository cityRepository;
    private UserClient userClient;
    private FavoriteService favoriteService;
    private CommentService commentService;
    private ReviewLikeService reviewLikeService;
    private FavoriteRepository favoriteRepository;
    private CommunityCommentRepository commentRepository;
    private CommentLikeRepository commentLikeRepository;
    private CommunityService communityService;
    private UserProfileResponse user;
    private City shanghaiCity;

    @BeforeEach
    void setUp() {
        postRepository = mock(CommunityPostRepository.class);
        likeRepository = mock(PostLikeRepository.class);
        reviewRepository = mock(ReviewRepository.class);
        cityRepository = mock(CityRepository.class);
        userClient = mock(UserClient.class);
        favoriteService = mock(FavoriteService.class);
        commentService = mock(CommentService.class);
        reviewLikeService = mock(ReviewLikeService.class);
        favoriteRepository = mock(FavoriteRepository.class);
        commentRepository = mock(CommunityCommentRepository.class);
        commentLikeRepository = mock(CommentLikeRepository.class);
        communityService = new CommunityService(postRepository, likeRepository, reviewRepository, cityRepository, userClient, favoriteService, commentService, reviewLikeService, favoriteRepository, commentRepository, commentLikeRepository);
        user = new UserProfileResponse(UUID.randomUUID(), "ada@example.com", "Ada", "Lovelace", null, null, "Explorer", "USER", Instant.now(), Instant.now(), Instant.now());
        shanghaiCity = City.builder()
                .id(UUID.randomUUID())
                .cityId("SHA")
                .region("Shanghai")
                .country("中国")
                .build();
    }

    @Test
    void createsPostForAuthenticatedUser() {
        when(userClient.requireUser("token")).thenReturn(user);
        when(cityRepository.findByCityId("SHA")).thenReturn(Optional.of(shanghaiCity));
        when(postRepository.save(any(CommunityPost.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PostResponse response = communityService.createPost("token", new CreatePostRequest(
                "Shanghai weekend",
                "A compact route with museums and food.",
                null,
                CommunityCategory.TRAVEL_NOTE,
                "SHA",
                ReviewTargetType.ROUTE,
                "route-1",
                "Shanghai two-day route",
                List.of("https://example.com/photo.jpg", "ftp://ignored.example.com/photo.jpg")
        ));

        assertThat(response.title()).isEqualTo("Shanghai weekend");
        assertThat(response.contentFormat()).isEqualTo(PostContentFormat.PLAIN_TEXT);
        assertThat(response.destination()).isEqualTo("Shanghai");
        assertThat(response.destinationCityId()).isEqualTo("SHA");
        assertThat(response.associatedTargetType()).isEqualTo(ReviewTargetType.ROUTE);
        assertThat(response.associatedTargetId()).isEqualTo("route-1");
        assertThat(response.associatedTargetName()).isEqualTo("Shanghai two-day route");
        assertThat(response.authorUserId()).isEqualTo(user.id());
        assertThat(response.authorName()).isEqualTo("Ada Lovelace");
        assertThat(response.imageUrls()).containsExactly("https://example.com/photo.jpg");
    }

    @Test
    void createsMarkdownPostWithLongContent() {
        when(userClient.requireUser("token")).thenReturn(user);
        when(postRepository.save(any(CommunityPost.class))).thenAnswer(invocation -> invocation.getArgument(0));
        String markdown = "# Shanghai plan\n\n" + "- Museum\n".repeat(1200);

        PostResponse response = communityService.createPost("token", new CreatePostRequest(
                "AI plan",
                markdown,
                PostContentFormat.MARKDOWN,
                CommunityCategory.TRAVEL_NOTE,
                null,
                null,
                null,
                null,
                List.of()
        ));

        assertThat(response.content()).isEqualTo(markdown.trim());
        assertThat(response.contentFormat()).isEqualTo(PostContentFormat.MARKDOWN);
    }

    @Test
    void rejectsPostCreationWithoutAuthenticatedUser() {
        when(userClient.requireUser("bad-token")).thenThrow(new ResponseStatusException(UNAUTHORIZED, "Invalid session token"));

        assertThatThrownBy(() -> communityService.createPost("bad-token", new CreatePostRequest(
                "Title",
                "Content",
                null,
                CommunityCategory.TRAVEL_NOTE,
                null,
                null,
                null,
                null,
                List.of()
        ))).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void searchesPostsByCategoryAndKeyword() {
        CommunityPost post = post("Suzhou gardens");
        when(postRepository.findFiltered(eq(CommunityCategory.TRAVEL_NOTE), isNull(), eq("Suzhou"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(post)));

        List<PostResponse> posts = communityService.listPosts(CommunityCategory.TRAVEL_NOTE, null, " Suzhou ", 0, 12, "latest", null)
                .getContent();

        assertThat(posts).hasSize(1);
        assertThat(posts.get(0).title()).isEqualTo("Suzhou gardens");
    }

    @Test
    void filtersPostsByDestinationCity() {
        CommunityPost post = post("Shanghai weekend");
        when(postRepository.findFiltered(eq(CommunityCategory.TRAVEL_NOTE), eq("SHA"), isNull(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(post)));

        List<PostResponse> posts = communityService.listPosts(CommunityCategory.TRAVEL_NOTE, " SHA ", null, 0, 12, "latest", null)
                .getContent();

        assertThat(posts).hasSize(1);
        assertThat(posts.get(0).title()).isEqualTo("Shanghai weekend");
    }

    @Test
    void togglesLikeWithoutDoubleCounting() {
        CommunityPost post = post("Liked post");
        when(userClient.requireUser("token")).thenReturn(user);
        when(postRepository.findById(post.getId())).thenReturn(Optional.of(post));
        when(postRepository.save(any(CommunityPost.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(likeRepository.findByPostIdAndUserId(post.getId(), user.id())).thenReturn(Optional.empty());
        // toggleLike derives the count from the repository: 1 after liking, 0 after unliking
        when(likeRepository.countByPostId(post.getId())).thenReturn(1L, 0L);

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
                CommunityCategory.SCENIC_SPOT,
                List.of()
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
                .destinationCity(shanghaiCity)
                .imageUrls(List.of())
                .authorUserId(user.id())
                .authorName("Ada Lovelace")
                .likeCount(0)
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();
    }
}
