package org.microarchitecturovisco.hotelservice.model.dto;

import jakarta.persistence.*;
import lombok.Builder;
import lombok.Data;
import java.util.List;
import java.math.BigDecimal;

@Data
@Builder
public class RoomDto {
    @Id
    private Long roomId;

    private Integer hotelId;

    private String name;

    private int guestCapacity;

    private String roomType;

    private BigDecimal pricePerAdult;
    @Lob
    private String description;

    private List<RoomReservationDto> roomReservations;
}
