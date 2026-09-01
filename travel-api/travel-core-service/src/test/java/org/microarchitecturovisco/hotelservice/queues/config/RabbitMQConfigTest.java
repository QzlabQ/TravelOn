package org.microarchitecturovisco.hotelservice.queues.config;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.amqp.core.AmqpTemplate;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.retry.RepublishMessageRecoverer;
import org.springframework.retry.support.RetryTemplate;

import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class RabbitMQConfigTest {

    @Test
    void infrastructureFailureUsesBoundedRetriesWithBackoff() {
        RetryTemplate retry = RabbitMQConfig.buildRetryTemplate(4, 10, 2.0, 40);
        AtomicInteger attempts = new AtomicInteger();
        long startedAt = System.nanoTime();

        String result = retry.execute(context -> {
            attempts.incrementAndGet();
            throw new IllegalStateException("database unavailable");
        }, context -> "dead-lettered");

        long elapsedMillis = (System.nanoTime() - startedAt) / 1_000_000;
        assertThat(result).isEqualTo("dead-lettered");
        assertThat(attempts).hasValue(4);
        assertThat(elapsedMillis).isGreaterThanOrEqualTo(60);
    }

    @Test
    void deterministicBusinessFailureIsNotRetried() {
        RetryTemplate retry = RabbitMQConfig.buildRetryTemplate(4, 10, 2.0, 40);
        AtomicInteger attempts = new AtomicInteger();

        String result = retry.execute(context -> {
            attempts.incrementAndGet();
            throw new IllegalStateException(
                    "listener failed", new IllegalArgumentException("invalid reservation payload"));
        }, context -> "dead-lettered");

        assertThat(result).isEqualTo("dead-lettered");
        assertThat(attempts).hasValue(1);
    }

    @Test
    void deadLetterRetainsPayloadAndFailureDiagnostics() {
        AmqpTemplate template = mock(AmqpTemplate.class);
        RepublishMessageRecoverer recoverer = new RepublishMessageRecoverer(
                template,
                QueuesConfig.EXCHANGE_HOTEL_RESERVATION_DLX,
                QueuesConfig.ROUTING_KEY_HOTEL_CREATE_RESERVATION_DLQ);
        Message original = new Message(
                "{\"reservationId\":\"reservation-123\"}".getBytes(), new MessageProperties());

        recoverer.recover(original, new IllegalStateException("database unavailable"));

        ArgumentCaptor<Message> deadLetter = ArgumentCaptor.forClass(Message.class);
        verify(template).send(
                org.mockito.ArgumentMatchers.eq(QueuesConfig.EXCHANGE_HOTEL_RESERVATION_DLX),
                org.mockito.ArgumentMatchers.eq(QueuesConfig.ROUTING_KEY_HOTEL_CREATE_RESERVATION_DLQ),
                deadLetter.capture());
        assertThat(new String(deadLetter.getValue().getBody())).contains("reservation-123");
        assertThat(deadLetter.getValue().getMessageProperties().getHeaders())
                .containsEntry(RepublishMessageRecoverer.X_EXCEPTION_MESSAGE, "database unavailable")
                .containsKey(RepublishMessageRecoverer.X_EXCEPTION_STACKTRACE);
    }
}
