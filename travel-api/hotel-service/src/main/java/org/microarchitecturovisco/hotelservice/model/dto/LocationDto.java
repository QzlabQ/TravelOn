package org.microarchitecturovisco.hotelservice.model.dto;

import lombok.Builder;
import lombok.Data;
import java.io.Serializable;
import java.util.UUID;

@Data
@Builder
public class LocationDto implements Serializable {
    private UUID idLocation;
    private String cityId;
    private String country;
    private String province;
    private String region;
    private String normalizedName;
}

