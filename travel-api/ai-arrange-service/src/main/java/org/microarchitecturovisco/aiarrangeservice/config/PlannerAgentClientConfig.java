package org.microarchitecturovisco.aiarrangeservice.config;

import io.netty.channel.ChannelOption;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;

@Configuration
public class PlannerAgentClientConfig {

    @Bean
    @Qualifier("plannerAgentWebClient")
    public WebClient plannerAgentWebClient(PlannerAgentProperties properties) {
        int timeoutSeconds = properties.getTimeoutSeconds() == null ? 150 : properties.getTimeoutSeconds();
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, Math.toIntExact(Duration.ofSeconds(10).toMillis()))
                .responseTimeout(Duration.ofSeconds(timeoutSeconds));

        return WebClient.builder()
                .baseUrl(properties.getBaseUrl())
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }
}
