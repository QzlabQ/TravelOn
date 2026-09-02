package org.microarchitecturovisco.apigateway;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cloud.gateway.config.GatewayProperties;

import java.util.Set;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("pre")  // 前置守卫：校验数据、资源与配置本身，不是业务逻辑的单元测试
@SpringBootTest
class GatewayRouteConfigurationTest {

    @Autowired
    private GatewayProperties gatewayProperties;

    @Test
    void removedServicesAreNotExposedByGateway() {
        Set<String> routeIds = gatewayProperties.getRoutes().stream()
                .map(route -> route.getId())
                .collect(Collectors.toSet());

        assertThat(routeIds)
                .doesNotContain(
                        "offer-provider-service",
                        "payment-service",
                        "hotel-service",
                        "transport-service");
    }

    @Test
    void reservationApiIsRoutedToOrderService() {
        Map<String, org.springframework.cloud.gateway.route.RouteDefinition> routes =
                gatewayProperties.getRoutes().stream()
                        .collect(Collectors.toMap(
                                org.springframework.cloud.gateway.route.RouteDefinition::getId,
                                Function.identity()));

        assertThat(routes).containsKey("order-service");
        assertThat(routes.get("order-service").getUri().toString()).isEqualTo("lb://order-service");
        assertThat(routes).doesNotContainKey("reservation-service");
    }

    @Test
    void productApisAreRoutedToTravelCoreService() {
        Map<String, org.springframework.cloud.gateway.route.RouteDefinition> routes =
                gatewayProperties.getRoutes().stream()
                        .collect(Collectors.toMap(
                                org.springframework.cloud.gateway.route.RouteDefinition::getId,
                                Function.identity()));

        assertThat(routes.get("travel-core-hotels").getUri().toString())
                .isEqualTo("lb://travel-core-service");
        assertThat(routes.get("travel-core-transports").getUri().toString())
                .isEqualTo("lb://travel-core-service");
    }
}
