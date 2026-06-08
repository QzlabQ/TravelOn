package org.microarchitecturovisco.offerprovider.services;

import org.microarchitecturovisco.offerprovider.domain.dto.LocationDto;
import org.microarchitecturovisco.offerprovider.domain.dto.OfferDto;
import org.microarchitecturovisco.offerprovider.domain.dto.RoomsConfigurationDto;
import org.microarchitecturovisco.offerprovider.domain.requests.GetOfferDetailsRequestDto;
import org.microarchitecturovisco.offerprovider.domain.requests.GetOfferPriceRequestDto;
import org.microarchitecturovisco.offerprovider.domain.responses.GetOfferDetailsResponseDto;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
public class OffersService {

    public List<OfferDto> getOffersBasedOnSearchQuery(List<UUID> departureBuses,
                                                      List<UUID> departurePlane,
                                                      List<UUID> arrivals,
                                                      String dateFromString,
                                                      String dateToString,
                                                      Integer adults,
                                                      Integer infants,
                                                      Integer kids,
                                                      Integer teens) {
        return List.of();
    }

    public GetOfferDetailsResponseDto getOfferDetails(GetOfferDetailsRequestDto requestDto) {
        return GetOfferDetailsResponseDto.builder()
                .idHotel(requestDto.getIdHotel())
                .hotelName("旅游产品功能重构中")
                .description("旧旅游套餐组合逻辑已停用，新的旅游产品功能稍后接入。")
                .price(-1.0f)
                .destination(LocationDto.builder().country("").region("").build())
                .imageUrls(List.of())
                .roomConfiguration(RoomsConfigurationDto.builder().rooms(List.of()).pricePerAdult(-1.0f).build())
                .possibleRoomConfigurations(List.of())
                .cateringOptions(List.of())
                .departure(List.of())
                .possibleDepartures(List.of())
                .build();
    }

    public Float getOfferPrice(GetOfferPriceRequestDto requestDto) {
        return -1.0f;
    }
}
