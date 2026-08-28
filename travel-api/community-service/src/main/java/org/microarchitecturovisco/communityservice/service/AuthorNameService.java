package org.microarchitecturovisco.communityservice.service;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.communityservice.repository.AttractionRepository;
import org.microarchitecturovisco.communityservice.repository.CommunityCommentRepository;
import org.microarchitecturovisco.communityservice.repository.CommunityPostRepository;
import org.microarchitecturovisco.communityservice.repository.ReviewRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;
import java.util.logging.Logger;

/**
 * Refreshes the denormalized author display-name snapshots stored on community
 * content when the owning user renames themselves (Option A: keep the fast local
 * copy, sync it via an event instead of resolving the name on every read).
 */
@Service
@RequiredArgsConstructor
public class AuthorNameService {

    private static final Logger logger = Logger.getLogger(AuthorNameService.class.getName());

    private final CommunityPostRepository postRepository;
    private final CommunityCommentRepository commentRepository;
    private final ReviewRepository reviewRepository;
    private final AttractionRepository attractionRepository;

    @Transactional
    public void refreshAuthorName(UUID userId, String displayName) {
        if (userId == null || displayName == null || displayName.isBlank()) {
            return;
        }
        int posts = postRepository.updateAuthorName(userId, displayName);
        int comments = commentRepository.updateAuthorName(userId, displayName);
        int reviews = reviewRepository.updateAuthorName(userId, displayName);
        int attractions = attractionRepository.updateCreatedByName(userId, displayName);
        logger.info("Refreshed authorName for user " + userId + " -> posts=" + posts
                + ", comments=" + comments + ", reviews=" + reviews + ", attractions=" + attractions);
    }
}
