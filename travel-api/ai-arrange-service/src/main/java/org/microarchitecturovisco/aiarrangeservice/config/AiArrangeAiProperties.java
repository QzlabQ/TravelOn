package org.microarchitecturovisco.aiarrangeservice.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "ai.arrange.ai")
public class AiArrangeAiProperties {

    private String baseUrl;
    private String chatCompletionsPath;
    private String apiKey;
    private String model;
    private Double temperature = 0.6;
    private Integer timeoutSeconds = 90;
}
