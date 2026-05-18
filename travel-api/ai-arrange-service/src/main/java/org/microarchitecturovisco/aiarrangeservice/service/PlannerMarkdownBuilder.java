package org.microarchitecturovisco.aiarrangeservice.service;

import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerConversation;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerRouteSegment;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerSnapshotDraft;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.stream.Collectors;

@Component
public class PlannerMarkdownBuilder {

    public String buildFallbackMarkdown(PlannerConversation conversation, String assistantText, String nextQuestion, List<PlannerPlaceSuggestion> places, List<PlannerRouteSegment> routes) {
        String title = nullToDefault(conversation.getTitle(), buildDefaultTitle(conversation));
        String nextStep = hasText(nextQuestion) ? nextQuestion : defaultNextQuestion(conversation, places);
        String replySection = hasText(assistantText) ? assistantText.trim() : "AI 正在整理本轮建议。";
        String placeSection = renderPlaceSection(places);
        String routeSection = renderRouteSection(routes);

        return """
                # %s

                ## 本轮结论
                %s

                ## 可直接添加建议
                %s

                ## 下一步建议
                %s

                ## 参考路线
                %s
                """.formatted(title, replySection, placeSection, nextStep, routeSection).trim();
    }

    public String normalizeMarkdown(PlannerSnapshotDraft draft, PlannerConversation conversation, String assistantText) {
        String markdown = draft.getMarkdown();
        if (!hasText(markdown)) {
            return buildFallbackMarkdown(conversation, assistantText, draft.getNextQuestion(), draft.getPlaces(), draft.getRoutes());
        }

        String normalized = markdown.trim();
        normalized = appendSectionIfMissing(normalized, "本轮结论", hasText(assistantText) ? assistantText.trim() : "");
        normalized = appendSectionIfMissing(normalized, "可直接添加建议", renderPlaceSection(draft.getPlaces()));
        normalized = appendSectionIfMissing(normalized, "下一步建议", hasText(draft.getNextQuestion()) ? draft.getNextQuestion().trim() : defaultNextQuestion(conversation, draft.getPlaces()));
        normalized = appendSectionIfMissing(normalized, "参考路线", renderRouteSection(draft.getRoutes()));
        return normalized.trim();
    }

    private String appendSectionIfMissing(String markdown, String header, String body) {
        if (!hasText(body) || markdown.contains("## " + header)) {
            return markdown;
        }
        return markdown + "\n\n## " + header + "\n" + body.trim();
    }

    private String renderPlaceSection(List<PlannerPlaceSuggestion> places) {
        if (places == null || places.isEmpty()) {
            return "- 暂无可直接添加的候选";
        }

        return places.stream()
                .map(place -> {
                    StringBuilder line = new StringBuilder();
                    line.append("- ").append(nullToDefault(place.getName(), "未命名建议"));
                    if (place.getType() != null) {
                        line.append("（").append(place.getType().name()).append("）");
                    }
                    if (hasText(place.getDescription())) {
                        line.append("：").append(place.getDescription().trim());
                    }
                    return line.toString();
                })
                .collect(Collectors.joining("\n"));
    }

    private String renderRouteSection(List<PlannerRouteSegment> routes) {
        if (routes == null || routes.isEmpty()) {
            return "- 暂无路线";
        }

        return routes.stream()
                .map(route -> {
                    StringBuilder line = new StringBuilder();
                    line.append("- ").append(nullToDefault(route.getSummary(), "参考路线"));
                    if (hasText(route.getTransportMode())) {
                        line.append("（").append(route.getTransportMode()).append("）");
                    }
                    return line.toString();
                })
                .collect(Collectors.joining("\n"));
    }

    private String defaultNextQuestion(PlannerConversation conversation, List<PlannerPlaceSuggestion> places) {
        int selectedCount = conversation.getSelectedPlaceIds() == null ? 0 : conversation.getSelectedPlaceIds().size();
        int placeCount = places == null ? 0 : places.size();

        if (selectedCount == 0 && placeCount == 0) {
            return "你更想先定酒店区域，还是先从第一天的核心景点开始？";
        }
        if (selectedCount < 2) {
            return "要不要先把最想去的 3 个点位定下来，我再帮你串成路线？";
        }
        return "要不要我继续补齐餐厅和交通，并整理成可直接执行的版本？";
    }

    private String buildDefaultTitle(PlannerConversation conversation) {
        return conversation.getCoreSlots().getCity() + " 行前规划";
    }

    private String nullToDefault(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }

    private boolean hasText(String value) {
        return StringUtils.hasText(value);
    }
}
