package org.microarchitecturovisco.communityservice.util;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CommunityImagesTest {

    @Test
    void keepsBundledDefaultImagesAndFiltersUnknownRelativePaths() {
        assertThat(CommunityImages.normalize(List.of(
                " /community/defaults/featured-1.png ",
                "/community/uploads/user-photo.png",
                "https://example.com/photo.jpg",
                "ftp://ignored.example.com/photo.jpg",
                "/community/private/hidden.png"
        ))).containsExactly(
                "/community/defaults/featured-1.png",
                "/community/uploads/user-photo.png",
                "https://example.com/photo.jpg"
        );
    }

    @Test
    void deduplicatesAndCapsAcceptedImagesAtSixEntries() {
        assertThat(CommunityImages.normalize(List.of(
                "/community/defaults/featured-1.png",
                "/community/defaults/featured-1.png",
                "/community/uploads/1.png",
                "/community/uploads/2.png",
                "/community/uploads/3.png",
                "/community/uploads/4.png",
                "/community/uploads/5.png",
                "/community/uploads/6.png",
                "/community/uploads/7.png"
        ))).containsExactly(
                "/community/defaults/featured-1.png",
                "/community/uploads/1.png",
                "/community/uploads/2.png",
                "/community/uploads/3.png",
                "/community/uploads/4.png",
                "/community/uploads/5.png"
        );
    }
}
