package org.microarchitecturovisco.userservice;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.userservice.repositories.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 注册 → 登录 → 资料 → 常用旅客的完整链路，走真实的 Controller → Service → JPA → H2。
 *
 * UserControllerRouteTest 用 standaloneSetup + mock，只能验证路由映射；这里验证的是
 * 数据真的落库、令牌真的生效。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class UserServiceApplicationIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Test
    void registerLoginAndProfileUpdateArePersisted() throws Exception {
        String email = "it-" + UUID.randomUUID() + "@example.test";
        JsonNode registered = json(mockMvc.perform(post("/users/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody(email)))
                .andExpect(status().isCreated())
                .andReturn());
        String token = registered.get("token").asText();
        String userId = registered.get("user").get("id").asText();
        assertThat(userRepository.findById(UUID.fromString(userId))).isPresent();

        mockMvc.perform(get("/users/me").header("X-User-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.role").value("USER"));

        mockMvc.perform(put("/users/me")
                        .header("X-User-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"改名\",\"surname\":\"成功\",\"phone\":\"13900139000\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("改名"));

        assertThat(userRepository.findById(UUID.fromString(userId)).orElseThrow().getName())
                .isEqualTo("改名");

        // 登录必须换发一个可用的新令牌。
        String loginToken = json(mockMvc.perform(post("/users/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"TravelTest123!\"}"))
                .andExpect(status().isOk())
                .andReturn()).get("token").asText();
        mockMvc.perform(get("/users/me").header("X-User-Token", loginToken))
                .andExpect(status().isOk());
    }

    @Test
    void logoutInvalidatesTheSessionToken() throws Exception {
        String email = "it-logout-" + UUID.randomUUID() + "@example.test";
        String token = json(mockMvc.perform(post("/users/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody(email)))
                .andExpect(status().isCreated())
                .andReturn()).get("token").asText();

        mockMvc.perform(post("/users/auth/logout").header("X-User-Token", token))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/users/me").header("X-User-Token", token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void travelersCanBeCreatedUpdatedAndDeleted() throws Exception {
        String email = "it-traveler-" + UUID.randomUUID() + "@example.test";
        String token = json(mockMvc.perform(post("/users/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody(email)))
                .andExpect(status().isCreated())
                .andReturn()).get("token").asText();

        String travelerId = json(mockMvc.perform(post("/users/me/travelers")
                        .header("X-User-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"张三","travelerType":"ADULT","documentType":"ID_CARD",
                                 "documentNumber":"310000199001010011","phone":"13800138000",
                                 "student":false,"defaultTraveler":true}
                                """))
                .andExpect(status().isCreated())
                .andReturn()).get("id").asText();

        mockMvc.perform(put("/users/me/travelers/{id}", travelerId)
                        .header("X-User-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"李四","travelerType":"ADULT","documentType":"PASSPORT",
                                 "documentNumber":"E12345678","phone":"13700137000",
                                 "student":true,"defaultTraveler":true}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("李四"))
                .andExpect(jsonPath("$.documentType").value("PASSPORT"))
                .andExpect(jsonPath("$.student").value(true));

        mockMvc.perform(get("/users/me/travelers").header("X-User-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("李四"));

        mockMvc.perform(delete("/users/me/travelers/{id}", travelerId).header("X-User-Token", token))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/users/me/travelers").header("X-User-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void travelerEndpointsRejectMissingOrInvalidTokens() throws Exception {
        mockMvc.perform(get("/users/me/travelers"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/users/me/travelers").header("X-User-Token", "not-a-real-token"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void duplicateRegistrationIsRejected() throws Exception {
        String email = "it-dup-" + UUID.randomUUID() + "@example.test";
        mockMvc.perform(post("/users/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody(email)))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/users/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody(email)))
                .andExpect(status().isConflict());
    }

    private String registerBody(String email) {
        return """
                {"email":"%s","password":"TravelTest123!","name":"集成","surname":"测试",
                 "phone":"13800138000"}
                """.formatted(email);
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }
}
