package org.microarchitecturovisco.communityservice.service;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.communityservice.domain.CommentLike;
import org.microarchitecturovisco.communityservice.domain.CommunityComment;
import org.microarchitecturovisco.communityservice.domain.FavoriteTargetType;
import org.microarchitecturovisco.communityservice.dto.CommentLikeResponse;
import org.microarchitecturovisco.communityservice.dto.CommentResponse;
import org.microarchitecturovisco.communityservice.dto.CreateCommentRequest;
import org.microarchitecturovisco.communityservice.dto.UserProfileResponse;
import org.microarchitecturovisco.communityservice.repository.CommentLikeCount;
import org.microarchitecturovisco.communityservice.repository.CommentLikeRepository;
import org.microarchitecturovisco.communityservice.repository.CommunityCommentRepository;
import org.microarchitecturovisco.communityservice.repository.CommunityPostRepository;
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
public class CommentService {

    private final CommunityCommentRepository commentRepository;
    private final CommentLikeRepository commentLikeRepository;
    private final CommunityPostRepository postRepository;
    private final UserClient userClient;

    public List<CommentResponse> listPostComments(UUID postId, String sort, String token) {
        postRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Community post not found"));

        List<CommunityComment> comments = "likes".equalsIgnoreCase(sort)
                ? commentRepository.findByTargetOrderByLikeCountDesc(FavoriteTargetType.POST, postId.toString())
                : commentRepository.findByTargetTypeAndTargetIdOrderByCreatedAtDesc(FavoriteTargetType.POST, postId.toString());
        return toResponses(comments, userClient.tryResolveUserId(token));
    }

    public CommentResponse addPostComment(String token, UUID postId, CreateCommentRequest request) {
        UserProfileResponse user = userClient.requireUser(token);
        postRepository.findById(postId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Community post not found"));

        CommunityComment comment = CommunityComment.builder()
                .id(UUID.randomUUID())
                .targetType(FavoriteTargetType.POST)
                .targetId(postId.toString())
                .authorUserId(user.id())
                .authorName(user.displayName())
                .content(request.content().trim())
                .build();

        return CommentResponse.from(commentRepository.save(comment));
    }

    @Transactional
    public CommentLikeResponse togglePostCommentLike(String token, UUID postId, UUID commentId) {
        UserProfileResponse user = userClient.requireUser(token);
        CommunityComment comment = commentRepository.findById(commentId)
                .filter(item -> item.getTargetType() == FavoriteTargetType.POST && item.getTargetId().equals(postId.toString()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Comment not found"));

        return commentLikeRepository.findByCommentIdAndUserId(comment.getId(), user.id())
                .map(existing -> {
                    commentLikeRepository.delete(existing);
                    return new CommentLikeResponse(comment.getId(), false, (int) commentLikeRepository.countByCommentId(comment.getId()));
                })
                .orElseGet(() -> {
                    commentLikeRepository.save(CommentLike.builder()
                            .id(UUID.randomUUID())
                            .commentId(comment.getId())
                            .userId(user.id())
                            .createdAt(Instant.now())
                            .build());
                    return new CommentLikeResponse(comment.getId(), true, (int) commentLikeRepository.countByCommentId(comment.getId()));
                });
    }

    public long countPostComments(UUID postId) {
        return commentRepository.countByTargetTypeAndTargetId(FavoriteTargetType.POST, postId.toString());
    }

    @Transactional
    public void deletePostComment(String token, UUID postId, UUID commentId) {
        userClient.requireAdmin(token);
        CommunityComment comment = commentRepository.findById(commentId)
                .filter(item -> item.getTargetType() == FavoriteTargetType.POST && item.getTargetId().equals(postId.toString()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Comment not found"));
        commentLikeRepository.deleteByCommentId(comment.getId());
        commentRepository.delete(comment);
    }

    private List<CommentResponse> toResponses(List<CommunityComment> comments, UUID currentUserId) {
        if (comments.isEmpty()) {
            return List.of();
        }
        List<UUID> ids = comments.stream().map(CommunityComment::getId).toList();
        Set<UUID> likedByMe = currentUserId == null
                ? Set.of()
                : commentLikeRepository.findByUserIdAndCommentIdIn(currentUserId, ids).stream()
                        .map(CommentLike::getCommentId)
                        .collect(Collectors.toSet());
        Map<UUID, Long> counts = commentLikeRepository.countByCommentIdIn(ids).stream()
                .collect(Collectors.toMap(CommentLikeCount::getCommentId, CommentLikeCount::getLikeCount));
        return comments.stream()
                .map(comment -> CommentResponse.from(
                        comment,
                        Math.toIntExact(counts.getOrDefault(comment.getId(), 0L)),
                        likedByMe.contains(comment.getId())))
                .toList();
    }
}
