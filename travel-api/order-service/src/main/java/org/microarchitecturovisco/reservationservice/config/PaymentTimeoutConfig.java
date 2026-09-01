package org.microarchitecturovisco.reservationservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

@Configuration
public class PaymentTimeoutConfig {

    @Bean(name = "paymentTimeoutScheduler", destroyMethod = "shutdown")
    public ScheduledExecutorService paymentTimeoutScheduler() {
        return Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "payment-timeout-scheduler");
            thread.setDaemon(true);
            return thread;
        });
    }
}
