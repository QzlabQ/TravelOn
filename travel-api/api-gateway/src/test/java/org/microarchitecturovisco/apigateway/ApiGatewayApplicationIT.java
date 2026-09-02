package org.microarchitecturovisco.apigateway;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.reactive.server.WebTestClient;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 网关的路由**行为**测试。
 *
 * GatewayRouteConfigurationTest 断言的是配置里有哪些 RouteDefinition；这里发真实
 * HTTP 请求，验证 Path 谓词确实能把请求匹配上：
 *
 * - 命中路由但下游没有实例 → 503（负载均衡器找不到实例）
 * - 没有命中任何路由 → 404
 *
 * 两者的区别正是"路由到底配没配对"的判据，光看配置对象是看不出来的。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class ApiGatewayApplicationIT {

    @LocalServerPort
    private int port;

    @Autowired
    private RouteLocator routeLocator;

    private WebTestClient client() {
        return WebTestClient.bindToServer()
                .baseUrl("http://localhost:" + port)
                .responseTimeout(Duration.ofSeconds(20))
                .build();
    }

    @Test
    void everyConfiguredRouteIsLoaded() {
        assertThat(routeLocator.getRoutes().collectList().block())
                .extracting(route -> route.getId())
                .contains("user-service", "order-service", "community-service",
                        "travel-core-hotels", "travel-core-transports", "ai-arrange-service");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/hotels/destinations",
            "/transports/available",
            "/users/me",
            "/reservations/ping",
            "/community/posts",
            "/ai-arrange/api/conversations",
    })
    void businessPathsAreMatchedByARoute(String path) {
        // 503 说明谓词命中了路由、只是后端没有实例；换成 404 就意味着路由压根没匹配上。
        client().get().uri(path).exchange().expectStatus().isEqualTo(503);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/offers/anything",
            "/payments/anything",
            "/not-a-service/ping",
    })
    void removedOrUnknownPrefixesAreNotRouted(String path) {
        client().get().uri(path).exchange().expectStatus().isNotFound();
    }

    @Test
    void corsPreflightIsAnsweredByTheGateway() {
        client().options().uri("/users/me")
                .header("Origin", "http://localhost:3000")
                .header("Access-Control-Request-Method", "GET")
                .exchange()
                .expectStatus().is2xxSuccessful()
                .expectHeader().exists("Access-Control-Allow-Origin");
    }
}
