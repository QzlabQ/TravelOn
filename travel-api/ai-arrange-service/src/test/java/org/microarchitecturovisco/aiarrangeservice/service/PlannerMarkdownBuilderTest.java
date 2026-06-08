package org.microarchitecturovisco.aiarrangeservice.service;

import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerConversation;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerSnapshotDraft;
import org.microarchitecturovisco.aiarrangeservice.domain.model.TripCoreSlots;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PlannerMarkdownBuilderTest {

    private final PlannerMarkdownBuilder builder = new PlannerMarkdownBuilder();

    @Test
    void normalizeMarkdownEmbedsImagesBelowMatchedPlaceSection() {
        PlannerPlaceSuggestion place = PlannerPlaceSuggestion.builder()
                .name("The Bund")
                .imageUrl("https://img.test/bund-1.jpg")
                .imageUrls(List.of("https://img.test/bund-1.jpg", "https://img.test/bund-2.jpg"))
                .build();

        String markdown = builder.normalizeMarkdown(
                PlannerSnapshotDraft.builder()
                        .markdown("# Day 1\n\n### The Bund\nWalk along the river.")
                        .places(List.of(place))
                        .build(),
                conversation(),
                "assistant"
        );

        assertThat(markdown)
                .doesNotContain("### \u666f\u70b9\u56fe\u7247\u53c2\u8003")
                .contains("### The Bund\n\n![The Bund 1](https://img.test/bund-1.jpg)")
                .contains("![The Bund 2](https://img.test/bund-2.jpg)");
    }

    @Test
    void appendImageReferenceFallsBackToSectionWhenPlaceIsUnmatched() {
        PlannerPlaceSuggestion place = PlannerPlaceSuggestion.builder()
                .name("The Bund")
                .imageUrl("https://img.test/bund-1.jpg")
                .build();

        String markdown = builder.appendImageReferenceIfMissing("# Day 1\n\n- Walk along the river.", List.of(place));

        assertThat(markdown)
                .contains("### \u666f\u70b9\u56fe\u7247\u53c2\u8003")
                .contains("#### The Bund")
                .contains("![The Bund 1](https://img.test/bund-1.jpg)")
                .doesNotContain("![The Bund 2]");
    }

    @Test
    void normalizeMarkdownReplacesExistingImageReferenceSectionBeforeRendering() {
        PlannerPlaceSuggestion place = PlannerPlaceSuggestion.builder()
                .name("The Bund")
                .imageUrls(List.of("https://img.test/bund-1.jpg"))
                .build();

        String markdown = builder.normalizeMarkdown(
                PlannerSnapshotDraft.builder()
                        .markdown("# Day 1\n\n### \u666f\u70b9\u56fe\u7247\u53c2\u8003\nexisting")
                        .places(List.of(place))
                        .build(),
                conversation(),
                "assistant"
        );

        assertThat(markdown)
                .doesNotContain("\u666f\u70b9\u56fe\u7247\u53c2\u8003", "existing")
                .contains("- The Bund")
                .contains("![The Bund 1](https://img.test/bund-1.jpg)");
    }

    private PlannerConversation conversation() {
        return PlannerConversation.builder()
                .title("Shanghai plan")
                .coreSlots(TripCoreSlots.builder()
                        .city("Shanghai")
                        .peopleCount(2)
                        .build())
                .build();
    }
}
