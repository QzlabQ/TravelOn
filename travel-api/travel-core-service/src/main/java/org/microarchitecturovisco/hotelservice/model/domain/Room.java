package org.microarchitecturovisco.hotelservice.model.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.math.BigDecimal;
import java.util.List;


@Entity
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class Room {
    @Id
    private Long id;

    @ManyToOne()
    @JoinColumn(name="hotel_id")
    private Hotel hotel;

    @NotNull
    private String name;

    @NotNull
    private int guestCapacity;

    private String roomType;

    @NotNull
    @Column(precision = 12, scale = 2, nullable = false)
    private BigDecimal pricePerAdult;
    @Column(columnDefinition = "TEXT")
    private String description;

    @OneToMany(mappedBy="room", fetch = FetchType.EAGER)
    private List<RoomReservation> roomReservations;
}
