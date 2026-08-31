package org.microarchitecturovisco.apigateway;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cloud.gateway.config.GatewayProperties;

import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

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
                .doesNotContain("offer-provider-service", "payment-service");
    }
}
