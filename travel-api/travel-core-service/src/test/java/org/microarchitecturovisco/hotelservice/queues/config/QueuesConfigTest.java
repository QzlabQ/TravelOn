package org.microarchitecturovisco.hotelservice.queues.config;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Queue;

import static org.assertj.core.api.Assertions.assertThat;

class QueuesConfigTest {

    private final QueuesConfig config = new QueuesConfig();

    @Test
    void createReservationQueueDeadLettersRejectedMessages() {
        Queue queue = config.handleCreateHotelReservationQueue();

        assertThat(queue.getName()).isEqualTo("hotels.events.createHotelReservation.queue");
        assertThat(queue.isDurable()).isTrue();
        assertThat(queue.isAutoDelete()).isFalse();
        assertThat(queue.getArguments())
                .containsEntry("x-dead-letter-exchange", "hotels.reservations.dead-letter.exchange")
                .containsEntry("x-dead-letter-routing-key", "hotels.events.createHotelReservation.dead");
    }
}
