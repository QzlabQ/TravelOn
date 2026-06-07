package org.microarchitecturovisco.aiarrangeservice.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "ai.arrange.agent")
public class PlannerAgentProperties {

    private String baseUrl = "http://localhost:8090";
    private Integer timeoutSeconds = 150;
}
