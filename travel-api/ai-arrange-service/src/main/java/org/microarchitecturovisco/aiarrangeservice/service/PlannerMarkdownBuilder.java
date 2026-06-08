package org.microarchitecturovisco.aiarrangeservice.service;

import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerConversation;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerRouteSegment;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerSnapshotDraft;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
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
        String normalized = hasText(markdown) ? stripImageReferenceSection(markdown.trim()) : "";
        List<PlannerPlaceSuggestion> safePlaces = places == null ? List.of() : places;
        if (safePlaces.isEmpty()) {
            return appendSectionIfMissing(normalized, 3, IMAGE_REFERENCE_HEADER, IMAGE_REFERENCE_PLACEHOLDER).trim();
        }
        InlineImageResult inlineResult = appendInlineImageReferences(normalized, safePlaces);
        if (inlineResult.unmatchedPlaces().isEmpty()) {
            return inlineResult.markdown().trim();
        }
        return appendSectionIfMissing(inlineResult.markdown(), 3, IMAGE_REFERENCE_HEADER, renderImageSection(inlineResult.unmatchedPlaces())).trim();
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

    private InlineImageResult appendInlineImageReferences(String markdown, List<PlannerPlaceSuggestion> places) {
        if (!hasText(markdown) || places == null || places.isEmpty()) {
            return new InlineImageResult(markdown, places == null ? List.of() : places);
        }

        List<String> lines = new ArrayList<>(markdown.lines().toList());
        List<PlannerPlaceSuggestion> unmatchedPlaces = new ArrayList<>();
        for (PlannerPlaceSuggestion place : places) {
            int placeLineIndex = findPlaceLine(lines, place);
            if (placeLineIndex < 0) {
                unmatchedPlaces.add(place);
                continue;
            }
            if (!hasInlineImageReference(lines, placeLineIndex, place)) {
                lines.addAll(placeLineIndex + 1, blockLines(renderImageBlock(place)));
            }
        }
        return new InlineImageResult(trimBlankLines(String.join("\n", lines)), unmatchedPlaces);
    }

    private String renderImageSection(List<PlannerPlaceSuggestion> places) {
        if (places == null || places.isEmpty()) {
            return IMAGE_REFERENCE_PLACEHOLDER;
        }

        return places.stream()
                .map(place -> {
                    String placeName = nullToDefault(place.getName(), "未命名地点");
                    return "#### " + placeName + "\n" + renderImageBlock(place);
                })
                .collect(Collectors.joining("\n\n"));
    }

    private String renderImageBlock(PlannerPlaceSuggestion place) {
        String placeName = nullToDefault(place.getName(), "未命名地点");
        List<String> urls = imageUrls(place);
        if (urls.isEmpty()) {
            return IMAGE_REFERENCE_PLACEHOLDER;
        }

        StringBuilder section = new StringBuilder();
        for (int index = 0; index < urls.size(); index++) {
            if (section.length() > 0) {
                section.append("\n");
            }
            section.append("![")
                    .append(escapeImageAlt(placeName))
                    .append(" ")
                    .append(index + 1)
                    .append("](")
                    .append(urls.get(index))
                    .append(")");
        }
        return section.toString();
    }

    private List<String> blockLines(String block) {
        List<String> lines = new ArrayList<>();
        lines.add("");
        block.lines().forEach(lines::add);
        lines.add("");
        return lines;
    }

    private int findPlaceLine(List<String> lines, PlannerPlaceSuggestion place) {
        for (int index = 0; index < lines.size(); index++) {
            if (markdownHeadingLevel(lines.get(index).trim()) > 0 && lineMatchesPlace(lines.get(index), place)) {
                return index;
            }
        }
        for (int index = 0; index < lines.size(); index++) {
            String trimmed = lines.get(index).trim();
            if (!trimmed.startsWith("!") && lineMatchesPlace(trimmed, place)) {
                return index;
            }
        }
        return -1;
    }

    private boolean lineMatchesPlace(String line, PlannerPlaceSuggestion place) {
        if (place == null || !hasText(place.getName())) {
            return false;
        }
        String lineText = normalizeMatchText(line);
        String placeText = normalizeMatchText(place.getName());
        return hasText(placeText) && lineText.contains(placeText);
    }

    private boolean hasInlineImageReference(List<String> lines, int placeLineIndex, PlannerPlaceSuggestion place) {
        int scanEnd = inlineScanEnd(lines, placeLineIndex);
        List<String> urls = imageUrls(place);
        for (int index = placeLineIndex + 1; index < scanEnd; index++) {
            String trimmed = lines.get(index).trim();
            if (trimmed.contains(IMAGE_REFERENCE_PLACEHOLDER)) {
                return true;
            }
            if (isMarkdownImage(trimmed)) {
                return true;
            }
            if (urls.stream().anyMatch(trimmed::contains)) {
                return true;
            }
        }
        return false;
    }

    private int inlineScanEnd(List<String> lines, int placeLineIndex) {
        int currentLevel = markdownHeadingLevel(lines.get(placeLineIndex).trim());
        if (currentLevel == 0) {
            return Math.min(lines.size(), placeLineIndex + 8);
        }

        for (int index = placeLineIndex + 1; index < lines.size(); index++) {
            int nextLevel = markdownHeadingLevel(lines.get(index).trim());
            if (nextLevel > 0 && nextLevel <= currentLevel) {
                return index;
            }
        }
        return lines.size();
    }

    private String stripImageReferenceSection(String markdown) {
        if (!hasMarkdownHeader(markdown, IMAGE_REFERENCE_HEADER)) {
            return markdown;
        }

        List<String> result = new ArrayList<>();
        boolean skipping = false;
        int skipLevel = 0;
        for (String line : markdown.lines().toList()) {
            String trimmed = line.trim();
            int headingLevel = markdownHeadingLevel(trimmed);
            if (headingLevel > 0 && headingText(trimmed).equals(IMAGE_REFERENCE_HEADER)) {
                skipping = true;
                skipLevel = headingLevel;
                continue;
            }
            if (skipping) {
                if (headingLevel > 0 && headingLevel <= skipLevel) {
                    skipping = false;
                    result.add(line);
                }
                continue;
            }
            result.add(line);
        }
        return trimBlankLines(String.join("\n", result));
    }

    private int markdownHeadingLevel(String line) {
        int index = 0;
        while (index < line.length() && line.charAt(index) == '#') {
            index++;
        }
        return index > 0 && index < line.length() && Character.isWhitespace(line.charAt(index)) ? index : 0;
    }

    private boolean isMarkdownImage(String line) {
        return line.matches("^!\\[[^]]*]\\(.+\\)\\s*$");
    }

    private String headingText(String line) {
        int headingLevel = markdownHeadingLevel(line);
        return headingLevel == 0 ? "" : line.substring(headingLevel).trim();
    }

    private String normalizeMatchText(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT)
                .replaceAll("[\\s`*_#>\\-+.:：,，、;；()（）\\[\\]【】]+", "");
    }

    private String trimBlankLines(String value) {
        String[] lines = value.split("\\R", -1);
        int start = 0;
        int end = lines.length;
        while (start < end && lines[start].isBlank()) {
            start++;
        }
        while (end > start && lines[end - 1].isBlank()) {
            end--;
        }
        return String.join("\n", List.of(lines).subList(start, end));
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

    private record InlineImageResult(String markdown, List<PlannerPlaceSuggestion> unmatchedPlaces) {
    }
}
