package org.microarchitecturovisco.hotelservice.model.mappers;

import org.microarchitecturovisco.hotelservice.model.domain.Location;
import org.microarchitecturovisco.hotelservice.model.dto.LocationDto;

import java.util.List;

public class LocationMapper {
    public static LocationDto map(Location location) {
        return LocationDto.builder()
                .idLocation(location.getId())
                .cityId(location.getCityId())
                .country(location.getCountry())
                .province(location.getProvince())
                .region(location.getRegion())
                .normalizedName(location.getNormalizedName())
                .build();
    }

    public static Location map(LocationDto dto) {
        return Location.builder()
                .id(dto.getIdLocation())
                .cityId(dto.getCityId())
                .country(dto.getCountry())
                .province(dto.getProvince())
                .region(dto.getRegion())
                .normalizedName(dto.getNormalizedName())
                .build();
    }

    public static List<LocationDto> mapList(List<Location> locations) {
        return locations.stream().map(LocationMapper::map).toList();
    }
}
