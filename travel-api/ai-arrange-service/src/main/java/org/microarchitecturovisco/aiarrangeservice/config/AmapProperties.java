package org.microarchitecturovisco.aiarrangeservice.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "ai.arrange.amap")
public class AmapProperties {

    private String baseUrl;
    private String apiKey;
    private boolean enabled = true;
}
