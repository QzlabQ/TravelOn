package org.microarchitecturovisco.hotelservice.model.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.List;
import java.util.UUID;

@Entity
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class Location {
    @Id
    private UUID id;

    private UUID cityId;

    @NotNull
    private String country;

    private String province;

    private String region;

    private String normalizedName;

    @OneToMany(mappedBy = "location", cascade = CascadeType.ALL)
    private List<Hotel> hotel;
}
