package org.microarchitecturovisco.discoveryservice;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 注册中心自身必须真的把 Eureka 端点起起来。
 *
 * 只断言 Spring 上下文加载是不够的：Eureka server 的自动装配没生效时上下文照样能起，
 * 但所有服务都会注册失败，而整条测试链要到网关探测超时才会暴露。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class DiscoveryServiceApplicationIT {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    void eurekaRegistryEndpointIsServed() {
        HttpHeaders headers = new HttpHeaders();
        headers.setAccept(java.util.List.of(MediaType.APPLICATION_JSON));

        ResponseEntity<String> response = restTemplate.exchange(
                "http://localhost:" + port + "/eureka/apps",
                HttpMethod.GET,
                new HttpEntity<>(headers),
                String.class);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getBody()).contains("applications");
    }

    @Test
    void unknownApplicationIsReportedAsNotFound() {
        ResponseEntity<String> response = restTemplate.getForEntity(
                "http://localhost:" + port + "/eureka/apps/NO-SUCH-SERVICE", String.class);

        assertThat(response.getStatusCode().value()).isEqualTo(404);
    }
}
