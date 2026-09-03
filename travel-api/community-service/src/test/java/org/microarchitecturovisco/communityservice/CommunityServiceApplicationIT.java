package org.microarchitecturovisco.communityservice;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.communityservice.domain.City;
import org.microarchitecturovisco.communityservice.dto.UserProfileResponse;
import org.microarchitecturovisco.communityservice.repository.CityRepository;
import org.microarchitecturovisco.communityservice.service.UserClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 走真实的 Controller → Service → JPA → H2 链路。
 *
 * 只有 {@link UserClient} 被替换掉：它是跨服务的 HTTP 调用，在单服务集成测试里
 * 没有 user-service 可连；除此之外的社区业务逻辑与持久化都用真实实现。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CommunityServiceApplicationIT {

    private static final String TOKEN = "integration-token";
    private static final UUID AUTHOR_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final String CITY_ID = "C001";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private CityRepository cityRepository;

    @MockBean
    private UserClient userClient;

    @BeforeEach
    void setUp() {
        UserProfileResponse author = new UserProfileResponse(
                AUTHOR_ID, "author@example.test", "社区", "作者", "13800138000",
                null, "BRONZE", "USER", Instant.now(), Instant.now(), Instant.now());
        when(userClient.requireUser(eq(TOKEN))).thenReturn(author);
        when(userClient.requireOwnerOrAdmin(eq(TOKEN), any())).thenReturn(author);
        when(userClient.requireAdmin(eq(TOKEN))).thenReturn(author);
        when(userClient.tryResolveUserId(eq(TOKEN))).thenReturn(AUTHOR_ID);

        if (cityRepository.findByCityId(CITY_ID).isEmpty()) {
            cityRepository.save(City.builder()
                    .id(UUID.randomUUID())
                    .cityId(CITY_ID)
                    .country("中国")
                    .province("上海市")
                    .region("上海")
                    .normalizedName("上海")
                    .build());
        }
    }

    @Test
    void postCommentLikeAndFavoriteAreAllPersisted() throws Exception {
        String postId = createPost("集成测试帖");

        mockMvc.perform(post("/community/posts/{id}/likes", postId).header("X-User-Token", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.liked").value(true))
                .andExpect(jsonPath("$.likeCount").value(1));

        String commentId = readJson(mockMvc.perform(post("/community/posts/{id}/comments", postId)
                        .header("X-User-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"第一条评论\"}"))
                .andExpect(status().isCreated())
                .andReturn()).get("id").asText();

        mockMvc.perform(get("/community/posts/{id}/comments", postId).header("X-User-Token", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(commentId));

        mockMvc.perform(post("/community/favorites/toggle")
                        .header("X-User-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"POST\",\"targetId\":\"" + postId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.favorited").value(true));

        mockMvc.perform(get("/community/me/favorites/posts").header("X-User-Token", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(postId));

        // 帖子详情要能带出点赞、收藏和评论数这些聚合字段，而不只是原始记录。
        mockMvc.perform(get("/community/posts/{id}", postId).header("X-User-Token", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.likeCount").value(1))
                .andExpect(jsonPath("$.likedByCurrentUser").value(true))
                .andExpect(jsonPath("$.favoritedByCurrentUser").value(true))
                .andExpect(jsonPath("$.commentCount").value(1));

        mockMvc.perform(delete("/community/posts/{id}", postId).header("X-User-Token", TOKEN))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/community/posts/{id}", postId))
                .andExpect(status().isNotFound());
    }

    @Test
    void writeEndpointsRejectAnonymousCallers() throws Exception {
        when(userClient.requireUser(null)).thenThrow(
                new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.UNAUTHORIZED, "Missing session token"));

        mockMvc.perform(post("/community/posts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(postBody("未登录不应通过")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void attractionAndRouteSurviveTheRoundTrip() throws Exception {
        String attractionId = readJson(mockMvc.perform(post("/community/attractions")
                        .header("X-User-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"外滩","cityId":"C001","description":"黄浦江畔","imageUrls":[]}
                                """))
                .andExpect(status().isCreated())
                .andReturn()).get("id").asText();

        String routeId = readJson(mockMvc.perform(post("/community/routes")
                        .header("X-User-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"上海两日游","summary":"经典路线","days":2,"peopleCount":2,
                                 "budget":1500,"style":"LEISURE","cityId":"C001","imageUrls":[],
                                 "stops":[{"attractionId":"%s","dayNumber":1,"sortOrder":0,"note":"上午"}]}
                                """.formatted(attractionId)))
                .andExpect(status().isCreated())
                .andReturn()).get("id").asText();

        mockMvc.perform(get("/community/routes/{id}", routeId).header("X-User-Token", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stops.length()").value(1))
                .andExpect(jsonPath("$.stops[0].attractionId").value(attractionId))
                .andExpect(jsonPath("$.stops[0].attractionName").value("外滩"));

        mockMvc.perform(post("/community/routes/{id}/reviews", routeId)
                        .header("X-User-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\":5,\"content\":\"安排合理\",\"imageUrls\":[]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.targetId").value(routeId));

        // 评价写入后，路线详情里的平均分和评价数必须跟着变。
        mockMvc.perform(get("/community/routes/{id}", routeId).header("X-User-Token", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reviewCount").value(1))
                .andExpect(jsonPath("$.averageRating").value(5.0));

        mockMvc.perform(delete("/community/routes/{id}", routeId).header("X-User-Token", TOKEN))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/community/routes/{id}", routeId))
                .andExpect(status().isNotFound());
    }

    @Test
    void routeCreationRejectsUnknownAttractions() throws Exception {
        mockMvc.perform(post("/community/routes")
                        .header("X-User-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"非法路线","summary":"","days":1,"peopleCount":1,"budget":0,
                                 "style":"LEISURE","cityId":"C001","imageUrls":[],
                                 "stops":[{"attractionId":"00000000-0000-0000-0000-000000000000",
                                           "dayNumber":1,"sortOrder":0,"note":""}]}
                                """))
                .andExpect(status().isBadRequest());
    }

    private String createPost(String title) throws Exception {
        return readJson(mockMvc.perform(post("/community/posts")
                        .header("X-User-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(postBody(title)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.authorUserId").value(AUTHOR_ID.toString()))
                .andReturn()).get("id").asText();
    }

    private String postBody(String title) {
        return """
                {"title":"%s","content":"集成测试正文","contentFormat":"PLAIN_TEXT",
                 "category":"TRAVEL_NOTE","destinationCityId":"%s","imageUrls":[]}
                """.formatted(title, CITY_ID);
    }

    private JsonNode readJson(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    @Test
    void contextLoads() {
        assertThat(mockMvc).isNotNull();
    }
}
