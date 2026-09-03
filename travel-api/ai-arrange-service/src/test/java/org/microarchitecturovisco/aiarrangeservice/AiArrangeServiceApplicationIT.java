package org.microarchitecturovisco.aiarrangeservice;

import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.aiarrangeservice.config.PlannerAgentProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 此前 ai-arrange-service 连一个 {@code *IT} 都没有，failsafe 跑 0 个测试。
 *
 * 会话数据落在 MongoDB，单服务集成测试里没有实例可连，所以这里只覆盖**不触碰仓储**
 * 的部分：端点是否真的映射上、参数校验是否在进入业务之前就拦住非法请求、Agent 客户端
 * 是否按配置装配。落库路径由 travel-api/tests/integration/test_planner_api.py 在带真实
 * MongoDB 的服务栈上覆盖。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AiArrangeServiceApplicationIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RequestMappingHandlerMapping handlerMapping;

    @Autowired
    private PlannerAgentProperties agentProperties;

    @Test
    void plannerConversationEndpointsAreMapped() {
        Set<String> patterns = handlerMapping.getHandlerMethods().keySet().stream()
                .map(RequestMappingInfo::getPathPatternsCondition)
                .filter(condition -> condition != null)
                .flatMap(condition -> condition.getPatternValues().stream())
                .collect(Collectors.toSet());

        assertThat(patterns).contains(
                "/ai-arrange/api/conversations",
                "/ai-arrange/api/conversations/{conversationId}",
                "/ai-arrange/api/conversations/{conversationId}/selection",
                "/ai-arrange/api/conversations/{conversationId}/snapshots",
                "/ai-arrange/api/conversations/{conversationId}/snapshots/{version}",
                "/ai-arrange/api/conversations/{conversationId}/day-plans/{dayIndex}/versions",
                "/ai-arrange/api/conversations/{conversationId}/day-plans/assemble",
                "/ai-arrange/api/conversations/{conversationId}/markdown-snapshots",
                "/ai-arrange/api/conversations/{conversationId}/planner/run");
    }

    @Test
    void createConversationRejectsAMissingUserId() throws Exception {
        mockMvc.perform(post("/ai-arrange/api/conversations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void listConversationsRequiresAUserId() throws Exception {
        mockMvc.perform(get("/ai-arrange/api/conversations"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void markdownSnapshotRejectsAnEmptyDocument() throws Exception {
        mockMvc.perform(post("/ai-arrange/api/conversations/{id}/markdown-snapshots",
                        "00000000-0000-0000-0000-000000000001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"userId":"00000000-0000-0000-0000-000000000002","markdown":"",
                                 "mode":"TRIP","baseVersion":0}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void agentClientIsWiredFromConfiguration() {
        assertThat(agentProperties.getBaseUrl()).isEqualTo("http://127.0.0.1:59999");
        assertThat(agentProperties.getTimeoutSeconds()).isPositive();
    }
}
