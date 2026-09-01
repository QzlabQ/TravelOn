package org.microarchitecturovisco.reservationservice.services.saga;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.CreateTransportReservationRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.ReservationRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.TransportReservationDeleteRequest;
import org.microarchitecturovisco.reservationservice.queues.config.QueuesTransportConfig;
import org.microarchitecturovisco.reservationservice.utils.json.JsonConverter;
import org.microarchitecturovisco.reservationservice.utils.json.JsonReader;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;

import java.util.logging.Logger;

@Service
@RequiredArgsConstructor
public class BookTransportsSaga {
    private final RabbitTemplate rabbitTemplate;
    public static Logger logger = Logger.getLogger(BookTransportsSaga.class.getName());

    public void createTransportReservation(ReservationRequest reservationRequest) {
        int amountOfQuests = reservationRequest.getAdultsQuantity() + reservationRequest.getChildrenUnder18Quantity()
                + reservationRequest.getChildrenUnder10Quantity() + reservationRequest.getChildrenUnder3Quantity();

        CreateTransportReservationRequest request = CreateTransportReservationRequest.builder()
                .hotelTimeFrom(reservationRequest.getHotelTimeFrom())
                .hotelTimeTo(reservationRequest.getHotelTimeTo())
                .amountOfQuests(amountOfQuests)
                .transportIds(reservationRequest.getTransportReservationsIds())
                .reservationId(reservationRequest.getId())
                .build();

        String requestJson = JsonConverter.convert(request);

        logger.info("Creating Transport reservation: " + requestJson);

        rabbitTemplate.convertAndSend(
                QueuesTransportConfig.EXCHANGE_TRANSPORT_FANOUT,
                "", // Routing key is ignored for FanoutExchange
                requestJson
        );
    }

    public void deleteTransportReservation(TransportReservationDeleteRequest transportReservationDeleteRequest) {

        String requestJson = JsonConverter.convert(transportReservationDeleteRequest);
        logger.info("Deleting transport reservation: " + requestJson);

        rabbitTemplate.convertAndSend(
                QueuesTransportConfig.EXCHANGE_TRANSPORT_FANOUT_DELETE_RESERVATION,
                "", // Routing key is ignored for FanoutExchange
                requestJson
        );
    }
}
