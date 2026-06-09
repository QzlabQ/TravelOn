package org.microarchitecturovisco.hotelservice.model.events;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;

import java.time.LocalDateTime;

@AllArgsConstructor
@NoArgsConstructor
@SuperBuilder
@Getter
@Setter
public class RoomUpdateEvent extends HotelEvent{
    private Long roomId;
    private String name;
    private int guestCapacity;
    private float pricePerAdult;
    private String description;

    public RoomUpdateEvent(Integer idHotel, Long roomId, String name, int guestCapacity, float pricePerAdult,
                           String description) {
        this.setEventTimeStamp(LocalDateTime.now());
        this.setIdHotel(idHotel);

        this.roomId = roomId;
        this.name = name;
        this.guestCapacity = guestCapacity;
        this.pricePerAdult = pricePerAdult;
        this.description = description;
    }
}
