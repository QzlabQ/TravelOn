package org.microarchitecturovisco.hotelservice.transport.controllers;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.hotelservice.transport.model.cqrs.commands.CreateTransportReservationCommand;
import org.microarchitecturovisco.hotelservice.transport.services.TransportCommandService;
import org.microarchitecturovisco.hotelservice.transport.utils.json.JsonReader;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class TransportsCommandController {

    private final TransportCommandService transportCommandService;

    @RabbitListener(
            queues = "#{createTransportReservationRequestQueue.name}",
            containerFactory = "transportRabbitListenerContainerFactory")
    public void consumeCreateTransportReservationCommand(String commandDtoJson) {
        CreateTransportReservationCommand command = JsonReader.readCreateTransportReservationCommand(commandDtoJson);

        transportCommandService.createReservation(command);
    }

}
