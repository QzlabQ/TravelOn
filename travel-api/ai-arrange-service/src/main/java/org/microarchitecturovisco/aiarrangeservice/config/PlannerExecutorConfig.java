package org.microarchitecturovisco.aiarrangeservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Configuration
public class PlannerExecutorConfig {

    @Bean(destroyMethod = "shutdown")
    public ExecutorService plannerExecutorService() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }
}
