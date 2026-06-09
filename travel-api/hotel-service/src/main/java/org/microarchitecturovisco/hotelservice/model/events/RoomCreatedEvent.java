package org.microarchitecturovisco.hotelservice.model.events;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;
import org.microarchitecturovisco.hotelservice.model.dto.RoomDto;
import java.time.LocalDateTime;

@AllArgsConstructor
@NoArgsConstructor
@SuperBuilder
@Getter
@Setter
public class RoomCreatedEvent extends HotelEvent  {


    private Long roomId;
    private String name;
    private int guestCapacity;
    private String roomType;
    private float pricePerAdult;
    private String description;

    public RoomCreatedEvent(LocalDateTime eventTimeStamp, RoomDto roomDto, Integer idHotel) {
        this.setEventTimeStamp(eventTimeStamp);
        this.setIdHotel(idHotel);

        this.roomId = roomDto.getRoomId();
        this.name = roomDto.getName();
        this.guestCapacity = roomDto.getGuestCapacity();
        this.roomType = roomDto.getRoomType();
        this.pricePerAdult = roomDto.getPricePerAdult();
        this.description = roomDto.getDescription();
    }
}
