package org.microarchitecturovisco.aiarrangeservice.service;

import org.microarchitecturovisco.aiarrangeservice.client.AiChatMessage;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerConversation;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerMessage;
import org.microarchitecturovisco.aiarrangeservice.domain.document.PlannerSnapshot;
import org.microarchitecturovisco.aiarrangeservice.domain.model.PlannerPlaceSuggestion;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

@Component
public class PlannerPromptFactory {

    private static final int RECENT_MESSAGE_LIMIT = 10;
    private static final int SNAPSHOT_MARKDOWN_LIMIT = 700;

    public List<AiChatMessage> buildChatPrompt(PlannerConversation conversation, PlannerSnapshot latestSnapshot, List<PlannerMessage> history) {
        List<AiChatMessage> messages = new ArrayList<>();
        messages.add(new AiChatMessage("system", buildChatSystemPrompt(conversation, latestSnapshot)));

        recentMessages(history).stream()
                .map(this::toAiMessage)
                .forEach(messages::add);

        return messages;
    }

    public List<AiChatMessage> buildExtractionPrompt(PlannerConversation conversation, PlannerSnapshot latestSnapshot, List<PlannerMessage> history, String assistantText) {
        List<AiChatMessage> messages = new ArrayList<>();
        messages.add(new AiChatMessage("system", buildExtractionSystemPrompt(conversation, latestSnapshot)));
        messages.add(new AiChatMessage("user", buildExtractionUserPrompt(conversation, latestSnapshot, recentMessages(history), assistantText)));
        return messages;
    }

    private List<PlannerMessage> recentMessages(List<PlannerMessage> history) {
        if (history == null || history.isEmpty()) {
            return List.of();
        }

        int start = Math.max(0, history.size() - RECENT_MESSAGE_LIMIT);
        return history.subList(start, history.size());
    }

    private AiChatMessage toAiMessage(PlannerMessage message) {
        return new AiChatMessage(message.getRole().name().toLowerCase(), message.getContent());
    }

    private String buildChatSystemPrompt(PlannerConversation conversation, PlannerSnapshot latestSnapshot) {
        return """
                你是行前智能规划助手。你的目标不是一次性写出最终总计划，而是把旅行规划拆成一轮一轮的小步骤推进。

                每一轮都必须同时满足：
                1. 只推进一个规划焦点，不要一次性铺开全部天数。
                2. 如果信息还不够，只问一个最关键的问题，同时给出 3 个可直接添加的建议，方便用户懒人选择。
                3. 如果信息已经足够，给出本轮结论、3 到 5 个可直接添加的具体建议、以及下一步建议。
                4. 建议必须具体、可执行、可直接加入计划；景点、餐厅、酒店尽量使用真实名称。
                5. 如果用户已经选了点位，优先围绕已选点位继续优化。
                6. 不要输出 JSON，不要输出最终总方案，不要把所有候选一次性铺满。
                7. 每轮结尾都必须给出下一步建议，说明下一轮最应该做什么。

                输出建议结构：
                - 本轮结论
                - 可直接添加建议
                - 下一步建议

                当前出行信息：
                %s

                当前规划状态：
                %s
                """.formatted(buildCoreSlotsSummary(conversation), buildPlanningProgressSummary(latestSnapshot));
    }

    private String buildExtractionSystemPrompt(PlannerConversation conversation, PlannerSnapshot latestSnapshot) {
        return """
                你是旅行规划结果整理器。你要把“当前一轮对话”整理成一个可迭代的规划快照，而不是把整趟行程一次写完。

                只输出 JSON，不要输出解释、不要输出 markdown 代码块、不要输出额外文本。

                JSON schema：
                {
                  "title": "string",
                  "summary": "string",
                  "markdown": "string",
                  "nextQuestion": "string|null",
                  "places": [
                    {
                      "name": "string",
                      "type": "SCENIC|RESTAURANT|HOTEL|TRANSPORT|SHOPPING|OTHER",
                      "source": "AI",
                      "description": "string",
                      "tags": ["string"]
                    }
                  ],
                  "routes": [
                    {
                      "transportMode": "string",
                      "summary": "string"
                    }
                  ]
                }

                规则：
                1. markdown 只反映当前轮的进展，不要写成最终总方案。
                2. markdown 中建议保留三个小节：本轮结论、可直接添加建议、下一步建议。
                3. nextQuestion 要写成下一轮最值得问用户的一个具体问题；如果本轮已经足够完整，可以写空字符串或 null。
                4. places 必须是可直接加入计划中的具体候选点位，数量尽量 3-6 个，最多 8 个。
                5. 地点不要只写泛词，如“景点/餐厅/商圈”，尽量写真实名称或可搜索的精确名称。
                6. 酒店建议尽量写具体酒店名，方便内部 offer 匹配；餐厅和景点尽量写具体 POI 名。
                7. routes 只在有足够地点时给出，不要为了凑数硬写。
                8. 如果本轮只是在追问，也仍然给出少量最靠谱的直接可添加建议，方便懒人一键选择。
                9. 所有内容都要基于当前固定槽、最新快照、对话历史和本轮助手回复，不要凭空重写整套最终方案。

                当前出行信息：
                %s

                当前规划状态：
                %s
                """.formatted(buildCoreSlotsSummary(conversation), buildPlanningProgressSummary(latestSnapshot));
    }

    private String buildExtractionUserPrompt(PlannerConversation conversation, PlannerSnapshot latestSnapshot, List<PlannerMessage> history, String assistantText) {
        String historyText = history.stream()
                .map(message -> message.getRole().name() + ": " + message.getContent())
                .collect(Collectors.joining("\n"));

        return """
                当前出行信息：
                %s

                当前规划状态：
                %s

                本轮对话历史：
                %s

                本轮助手输出：
                %s
                """.formatted(
                buildCoreSlotsSummary(conversation),
                buildPlanningProgressSummary(latestSnapshot),
                historyText,
                assistantText
        );
    }

    private String buildCoreSlotsSummary(PlannerConversation conversation) {
        if (conversation.getCoreSlots() == null) {
            return "暂无固定槽位。";
        }

        return """
                - 城市: %s
                - 起始日期: %s
                - 结束日期: %s
                - 人数: %s
                - 预算: %s
                - 风格: %s
                - 住宿偏好: %s
                - 交通偏好: %s
                - 备注: %s
                """.formatted(
                nullToEmpty(conversation.getCoreSlots().getCity()),
                conversation.getCoreSlots().getTravelStartDate(),
                conversation.getCoreSlots().normalizedEndDate(),
                conversation.getCoreSlots().getPeopleCount(),
                nullToEmpty(conversation.getCoreSlots().getBudget()),
                nullToEmpty(conversation.getCoreSlots().getTravelStyle()),
                nullToEmpty(conversation.getCoreSlots().getAccommodationPreference()),
                nullToEmpty(conversation.getCoreSlots().getTransportPreference()),
                nullToEmpty(conversation.getCoreSlots().getNotes())
        );
    }

    private String buildPlanningProgressSummary(PlannerSnapshot latestSnapshot) {
        if (latestSnapshot == null) {
            return "暂无历史快照，正在开始第一轮。";
        }

        String selectedPlaces = latestSnapshot.getPlaces() == null ? "" : latestSnapshot.getPlaces().stream()
                .filter(PlannerPlaceSuggestion::isSelected)
                .map(place -> place.getName() + (StringUtils.hasText(place.getAddress()) ? "（" + place.getAddress() + "）" : ""))
                .filter(Objects::nonNull)
                .collect(Collectors.joining("、"));

        return """
                - 快照版本: %s
                - 标题: %s
                - 摘要: %s
                - 下一步建议: %s
                - 已选点位: %s
                - 当前 Markdown 摘要: %s
                """.formatted(
                latestSnapshot.getVersion(),
                nullToEmpty(latestSnapshot.getTitle()),
                nullToEmpty(latestSnapshot.getSummary()),
                nullToEmpty(latestSnapshot.getNextQuestion()),
                nullToEmpty(selectedPlaces),
                compact(latestSnapshot.getMarkdown(), SNAPSHOT_MARKDOWN_LIMIT)
        );
    }

    private String compact(String value, int limit) {
        if (!StringUtils.hasText(value)) {
            return "";
        }

        String trimmed = value.trim().replaceAll("\\s+", " ");
        if (trimmed.length() <= limit) {
            return trimmed;
        }
        return trimmed.substring(0, Math.max(0, limit - 3)) + "...";
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
