package org.microarchitecturovisco.aiarrangeservice.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "ai.arrange.model")
public class AiArrangeAiProperties {

    private String baseUrl = "https://api.deepseek.com";
    private String chatCompletionsPath = "/chat/completions";
    private String apiKey = "";
    private String model = "deepseek-v4-pro";
    private Double temperature = 0.6;
    private Integer timeoutSeconds = 90;
}
