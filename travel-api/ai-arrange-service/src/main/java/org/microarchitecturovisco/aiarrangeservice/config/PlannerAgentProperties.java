package org.microarchitecturovisco.aiarrangeservice.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "ai.arrange.agent")
public class PlannerAgentProperties {

    private String baseUrl = "http://127.0.0.1:8090";
    private Integer timeoutSeconds = 150;
}
