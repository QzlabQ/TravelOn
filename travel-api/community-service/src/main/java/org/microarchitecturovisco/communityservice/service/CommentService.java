package org.microarchitecturovisco.communityservice.service;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.communityservice.domain.CommunityComment;
import org.microarchitecturovisco.communityservice.domain.FavoriteTargetType;
import org.microarchitecturovisco.communityservice.dto.CommentResponse;
import org.microarchitecturovisco.communityservice.dto.CreateCommentRequest;
import org.microarchitecturovisco.communityservice.dto.UserProfileResponse;
import org.microarchitecturovisco.communityservice.repository.CommunityCommentRepository;
import org.microarchitecturovisco.communityservice.repository.CommunityPostRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CommentService {

    private final CommunityCommentRepository commentRepository;
    private final CommunityPostRepository postRepository;
    private final UserClient userClient;

    public List<CommentResponse> listPostComments(UUID postId) {
        return commentRepository
                .findByTargetTypeAndTargetIdOrderByCreatedAtDesc(FavoriteTargetType.POST, postId.toString())
                .stream()
                .map(CommentResponse::from)
                .toList();
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

    public long countPostComments(UUID postId) {
        return commentRepository.countByTargetTypeAndTargetId(FavoriteTargetType.POST, postId.toString());
    }
}
