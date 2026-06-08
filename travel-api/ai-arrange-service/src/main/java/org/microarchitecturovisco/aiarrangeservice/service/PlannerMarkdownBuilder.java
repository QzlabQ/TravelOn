package org.microarchitecturovisco.aiarrangeservice.service;

import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerConversation;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerRouteSegment;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerSnapshotDraft;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Component
public class PlannerMarkdownBuilder {

    private static final String IMAGE_REFERENCE_HEADER = "景点图片参考";
    private static final String IMAGE_REFERENCE_PLACEHOLDER = "- 暂无可展示图片，待地图服务返回图片后补充。";

    public String buildFallbackMarkdown(PlannerConversation conversation, String assistantText, String nextQuestion, List<PlannerPlaceSuggestion> places, List<PlannerRouteSegment> routes) {
        String title = nullToDefault(conversation.getTitle(), buildDefaultTitle(conversation));
        String nextStep = hasText(nextQuestion) ? nextQuestion : defaultNextQuestion(conversation, places);
        String replySection = hasText(assistantText) ? assistantText.trim() : "AI 正在整理本轮建议。";
        String placeSection = renderPlaceSection(places);
        String routeSection = renderRouteSection(routes);

        String markdown = """
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

        return appendImageReferenceIfMissing(markdown, places);
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
        return appendImageReferenceIfMissing(normalized, draft.getPlaces()).trim();
    }

    public String appendImageReferenceIfMissing(String markdown, List<PlannerPlaceSuggestion> places) {
        return appendSectionIfMissing(markdown, 3, IMAGE_REFERENCE_HEADER, renderImageSection(places)).trim();
    }

    private String appendSectionIfMissing(String markdown, String header, String body) {
        return appendSectionIfMissing(markdown, 2, header, body);
    }

    private String appendSectionIfMissing(String markdown, int level, String header, String body) {
        if (!hasText(body) || hasMarkdownHeader(markdown, header)) {
            return markdown;
        }
        return markdown + "\n\n" + "#".repeat(level) + " " + header + "\n" + body.trim();
    }

    private boolean hasMarkdownHeader(String markdown, String header) {
        Pattern pattern = Pattern.compile("^#{1,6}\\s+" + Pattern.quote(header.trim()) + "\\s*$");
        return markdown.lines()
                .map(String::trim)
                .anyMatch(line -> pattern.matcher(line).matches());
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

    private String renderImageSection(List<PlannerPlaceSuggestion> places) {
        if (places == null || places.isEmpty()) {
            return IMAGE_REFERENCE_PLACEHOLDER;
        }

        return places.stream()
                .map(place -> {
                    String placeName = nullToDefault(place.getName(), "未命名地点");
                    List<String> urls = imageUrls(place);
                    StringBuilder section = new StringBuilder("#### ").append(placeName);
                    if (urls.isEmpty()) {
                        return section.append("\n").append(IMAGE_REFERENCE_PLACEHOLDER).toString();
                    }
                    for (int index = 0; index < urls.size(); index++) {
                        section.append("\n")
                                .append("![")
                                .append(escapeImageAlt(placeName))
                                .append(" ")
                                .append(index + 1)
                                .append("](")
                                .append(urls.get(index))
                                .append(")");
                    }
                    return section.toString();
                })
                .collect(Collectors.joining("\n\n"));
    }

    private List<String> imageUrls(PlannerPlaceSuggestion place) {
        List<String> urls = new ArrayList<>();
        addImageUrl(urls, place.getImageUrl());
        if (place.getImageUrls() != null) {
            place.getImageUrls().forEach(url -> addImageUrl(urls, url));
        }
        return urls;
    }

    private void addImageUrl(List<String> urls, String url) {
        if (urls.size() >= 3 || !hasText(url)) {
            return;
        }
        String normalized = url.trim();
        if (!urls.contains(normalized)) {
            urls.add(normalized);
        }
    }

    private String escapeImageAlt(String value) {
        return value.replace("[", " ").replace("]", " ").trim();
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
