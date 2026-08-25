package org.microarchitecturovisco.offerprovider.domain.responses;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.offerprovider.domain.dto.LocationDto;
import org.microarchitecturovisco.offerprovider.domain.dto.RoomResponseDto;
import org.microarchitecturovisco.offerprovider.domain.dto.RoomsConfigurationDto;
import org.microarchitecturovisco.offerprovider.domain.dto.responses.TransportDto;

import java.util.List;
import java.math.BigDecimal;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class GetOfferDetailsResponseDto {
    private Integer idHotel;
    private String hotelName;
    private String description;
    private BigDecimal price;
    private LocationDto destination;
    private List<String> imageUrls;

    private RoomsConfigurationDto roomConfiguration;
    private List<RoomsConfigurationDto> possibleRoomConfigurations;

    private List<TransportDto> departure;
    private List<List<TransportDto>> possibleDepartures;
}
