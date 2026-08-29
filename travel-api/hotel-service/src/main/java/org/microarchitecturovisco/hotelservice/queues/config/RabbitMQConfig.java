package org.microarchitecturovisco.hotelservice.queues.config;

import org.aopalliance.aop.Advice;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.rabbit.config.RetryInterceptorBuilder;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.retry.RepublishMessageRecoverer;
import org.springframework.amqp.rabbit.retry.RejectAndDontRequeueRecoverer;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.amqp.support.converter.MessageConversionException;
import org.springframework.boot.autoconfigure.amqp.SimpleRabbitListenerContainerFactoryConfigurer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.retry.backoff.ExponentialBackOffPolicy;
import org.springframework.retry.policy.SimpleRetryPolicy;
import org.springframework.retry.support.RetryTemplate;

import java.util.Map;


@Configuration
public class RabbitMQConfig {
    @Bean(name="jsonMessageConverter")
    public MessageConverter jsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean(name = "hotelReservationListenerContainerFactory")
    public SimpleRabbitListenerContainerFactory hotelReservationListenerContainerFactory(
            SimpleRabbitListenerContainerFactoryConfigurer configurer,
            ConnectionFactory connectionFactory,
            MessageConverter messageConverter,
            RabbitTemplate rabbitTemplate,
            @Value("${hotel.reservation.retry.max-attempts:4}") int maxAttempts,
            @Value("${hotel.reservation.retry.initial-interval-ms:1000}") long initialInterval,
            @Value("${hotel.reservation.retry.multiplier:2.0}") double multiplier,
            @Value("${hotel.reservation.retry.max-interval-ms:10000}") long maxInterval) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        configurer.configure(factory, connectionFactory);
        factory.setMessageConverter(messageConverter);
        factory.setDefaultRequeueRejected(false);

        RepublishMessageRecoverer recoverer = new RepublishMessageRecoverer(
                rabbitTemplate,
                QueuesConfig.EXCHANGE_HOTEL_RESERVATION_DLX,
                QueuesConfig.ROUTING_KEY_HOTEL_CREATE_RESERVATION_DLQ);
        Advice retry = RetryInterceptorBuilder.stateless()
                .retryOperations(buildRetryTemplate(maxAttempts, initialInterval, multiplier, maxInterval))
                .recoverer(recoverer)
                .build();
        factory.setAdviceChain(retry);
        return factory;
    }

    @Bean(name = "rabbitListenerContainerFactory")
    public SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(
            SimpleRabbitListenerContainerFactoryConfigurer configurer,
            ConnectionFactory connectionFactory,
            MessageConverter messageConverter,
            @Value("${hotel.listener.retry.max-attempts:4}") int maxAttempts,
            @Value("${hotel.listener.retry.initial-interval-ms:1000}") long initialInterval,
            @Value("${hotel.listener.retry.multiplier:2.0}") double multiplier,
            @Value("${hotel.listener.retry.max-interval-ms:10000}") long maxInterval) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        configurer.configure(factory, connectionFactory);
        factory.setMessageConverter(messageConverter);
        factory.setDefaultRequeueRejected(false);
        Advice retry = RetryInterceptorBuilder.stateless()
                .retryOperations(buildRetryTemplate(maxAttempts, initialInterval, multiplier, maxInterval))
                .recoverer(new RejectAndDontRequeueRecoverer())
                .build();
        factory.setAdviceChain(retry);
        return factory;
    }

    static RetryTemplate buildRetryTemplate(int maxAttempts, long initialInterval,
                                            double multiplier, long maxInterval) {
        Map<Class<? extends Throwable>, Boolean> retryable = Map.of(
                IllegalArgumentException.class, false,
                MessageConversionException.class, false,
                AmqpRejectAndDontRequeueException.class, false);
        SimpleRetryPolicy retryPolicy = new SimpleRetryPolicy(maxAttempts, retryable, true, true);

        ExponentialBackOffPolicy backOff = new ExponentialBackOffPolicy();
        backOff.setInitialInterval(initialInterval);
        backOff.setMultiplier(multiplier);
        backOff.setMaxInterval(maxInterval);

        RetryTemplate template = new RetryTemplate();
        template.setRetryPolicy(retryPolicy);
        template.setBackOffPolicy(backOff);
        return template;
    }
}
