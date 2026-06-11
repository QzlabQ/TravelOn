package org.microarchitecturovisco.communityservice.util;

import java.util.List;

/**
 * Normalizes image references attached to posts and reviews. Accepts absolute
 * http(s) URLs (e.g. seed data) as well as relative paths produced by the local
 * upload endpoint ({@code /community/uploads/...}).
 */
public final class CommunityImages {

    private static final int MAX_IMAGES = 6;

    private CommunityImages() {
    }

    public static List<String> normalize(List<String> imageUrls) {
        if (imageUrls == null) {
            return List.of();
        }
        return imageUrls.stream()
                .map(url -> url == null ? null : url.trim())
                .filter(url -> url != null && !url.isEmpty())
                .filter(CommunityImages::isAllowed)
                .distinct()
                .limit(MAX_IMAGES)
                .toList();
    }

    private static boolean isAllowed(String url) {
        return url.startsWith("http://")
                || url.startsWith("https://")
                || url.startsWith("/community/uploads/");
    }
}
