package org.microarchitecturovisco.hotelservice.services;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.hotelservice.model.cqrs.commands.CreateHotelCommand;
import org.microarchitecturovisco.hotelservice.model.cqrs.commands.CreateRoomReservationCommand;
import org.microarchitecturovisco.hotelservice.model.cqrs.commands.DeleteRoomReservationCommand;
import org.microarchitecturovisco.hotelservice.model.dto.RoomDto;
import org.microarchitecturovisco.hotelservice.model.events.*;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class HotelsCommandService {
    private final HotelEventProjector hotelEventProjector;


    public void createHotel(CreateHotelCommand command) {
        HotelCreatedEvent hotelCreatedEvent =  new HotelCreatedEvent(command.getCommandTimeStamp(),
                command.getHotelDto());
        hotelCreatedEvent.setId(UUID.randomUUID());
        hotelEventProjector.project(List.of(hotelCreatedEvent));

        for (RoomDto roomDto : command.getHotelDto().getRooms()){
            RoomCreatedEvent roomCreatedEvent = new RoomCreatedEvent(command.getCommandTimeStamp(),
                    roomDto, command.getHotelDto().getHotelId());
            roomCreatedEvent.setId(UUID.randomUUID());
            hotelEventProjector.project(List.of(roomCreatedEvent));
        }
    }

    public void createReservation(CreateRoomReservationCommand command){
        RoomReservationCreatedEvent reservationCreatedEvent =  RoomReservationCreatedEvent.builder()
                .eventTimeStamp(command.getCommandTimeStamp())
                .dateFrom(command.getRoomReservationDto().getDateFrom())
                .dateTo(command.getRoomReservationDto().getDateTo())
                .idRoomReservation(command.getRoomReservationDto().getReservationId())
                .idHotel(command.getHotelId())
                .idRoom(command.getRoomId())
                .id(UUID.randomUUID())
                .build();

        hotelEventProjector.project(List.of(reservationCreatedEvent));
    }

    public void deleteReservation(DeleteRoomReservationCommand command){
        RoomReservationDeletedEvent reservationDeletedEvent =  RoomReservationDeletedEvent.builder()
                .eventTimeStamp(command.getCommandTimeStamp())
                .idRoomReservation(command.getReservationId())
                .idHotel(command.getHotelId())
                .idRoom(command.getRoomId())
                .id(UUID.randomUUID()) // event id
                .build();

        hotelEventProjector.project(List.of(reservationDeletedEvent));
    }

}
