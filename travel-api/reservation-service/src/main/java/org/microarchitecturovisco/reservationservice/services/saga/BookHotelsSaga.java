package org.microarchitecturovisco.reservationservice.services.saga;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.CheckHotelAvailabilityRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.CreateHotelReservationRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.HotelReservationDeleteRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.requests.ReservationRequest;
import org.microarchitecturovisco.reservationservice.domain.dto.responses.CheckHotelAvailabilityResponseDto;
import org.microarchitecturovisco.reservationservice.domain.exceptions.ReservationFailException;
import org.microarchitecturovisco.reservationservice.queues.config.QueuesHotelConfig;
import org.microarchitecturovisco.reservationservice.utils.json.JsonConverter;
import org.microarchitecturovisco.reservationservice.utils.json.JsonReader;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.logging.Logger;
import java.util.logging.Level;

@Service
@RequiredArgsConstructor
public class BookHotelsSaga {
    private final RabbitTemplate rabbitTemplate;
    public static Logger logger = Logger.getLogger(BookHotelsSaga.class.getName());

    public boolean checkIfHotelIsAvailable(ReservationRequest reservationRequest) throws ReservationFailException {
        CheckHotelAvailabilityRequest availabilityRequest = CheckHotelAvailabilityRequest.builder()
                .dateFrom(reservationRequest.getHotelTimeFrom())
                .dateTo(reservationRequest.getHotelTimeTo())
                .roomReservationsIds(reservationRequest.getRoomReservationsIds())
                .hotelId(reservationRequest.getHotelId())
                .build();

        String reservationRequestJson = JsonConverter.convert(availabilityRequest);

        logger.info("Checking hotel availability: " + availabilityRequest);

        try {
            Object responseMessage = rabbitTemplate.convertSendAndReceive(
                    QueuesHotelConfig.EXCHANGE_HOTEL,
                    QueuesHotelConfig.ROUTING_KEY_HOTEL_CHECK_AVAILABILITY_REQ,
                    reservationRequestJson);

            if (responseMessage != null) {
                String responseJson = normalizeAvailabilityResponse(responseMessage);
                CheckHotelAvailabilityResponseDto response = JsonReader.readDtoFromJson(
                        responseJson,
                        CheckHotelAvailabilityResponseDto.class
                );
                return response.isIfAvailable();
            }
            logger.warning("Null message at: checkIfHotelIsAvailable()");
            throw new ReservationFailException();
        } catch (Exception exception) {
            logger.log(Level.WARNING, "Failed to read hotel availability response.", exception);
            throw new ReservationFailException();
        }
    }

    private String normalizeAvailabilityResponse(Object responseMessage) throws Exception {
        String responseJson;
        if (responseMessage instanceof byte[] bytes) {
            responseJson = new String(bytes, StandardCharsets.UTF_8);
        } else if (responseMessage instanceof String string) {
            responseJson = string;
        } else {
            throw new IllegalArgumentException("Unsupported hotel availability response type: "
                    + responseMessage.getClass().getName());
        }

        responseJson = responseJson.trim();
        if (responseJson.startsWith("\"") && responseJson.endsWith("\"")) {
            return new ObjectMapper().readValue(responseJson, String.class);
        }
        return responseJson;
    }

    public void createHotelReservation(ReservationRequest reservationRequest) {
        CreateHotelReservationRequest request = CreateHotelReservationRequest.builder()
                                            .hotelTimeFrom(reservationRequest.getHotelTimeFrom())
                                            .hotelTimeTo(reservationRequest.getHotelTimeTo())
                                            .hotelId(reservationRequest.getHotelId())
                                            .reservationId(reservationRequest.getId())
                                            .roomIds(reservationRequest.getRoomReservationsIds())
                                            .build();

        String requestJson = JsonConverter.convert(request);

        logger.info("Creating Hotel reservation: " + requestJson);

        rabbitTemplate.convertAndSend(
                QueuesHotelConfig.EXCHANGE_HOTEL_FANOUT_CREATE_RESERVATION,
                "", // Routing key is ignored for FanoutExchange
                requestJson
        );
    }

    public void deleteHotelReservation(HotelReservationDeleteRequest hotelReservationDeleteRequest) {
        String requestJson = JsonConverter.convert(hotelReservationDeleteRequest);

        logger.info("Deleting hotel reservation: " + requestJson);

        rabbitTemplate.convertAndSend(
                QueuesHotelConfig.EXCHANGE_HOTEL_FANOUT_DELETE_RESERVATION,
                "", // Routing key is ignored for FanoutExchange
                requestJson
        );
    }

}
