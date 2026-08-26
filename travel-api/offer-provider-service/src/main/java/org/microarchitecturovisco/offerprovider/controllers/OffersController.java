package org.microarchitecturovisco.offerprovider.controllers;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.offerprovider.domain.dto.OfferDto;
import org.microarchitecturovisco.offerprovider.domain.requests.GetOfferDetailsRequestDto;
import org.microarchitecturovisco.offerprovider.domain.requests.GetOfferPriceRequestDto;
import org.microarchitecturovisco.offerprovider.domain.responses.GetOfferDetailsResponseDto;
import org.microarchitecturovisco.offerprovider.services.OffersService;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.math.BigDecimal;
import java.util.List;
import java.util.logging.Logger;

@RestController
@RequiredArgsConstructor
@RequestMapping("/offers")
public class OffersController {

    private final OffersService offersService;

    @GetMapping("/")
    public List<OfferDto> getOffersBasedOnSearchQuery(
            @RequestParam(name = "departureBus", required = false) List<String> departureBuses,
            @RequestParam(name = "departurePlane", required = false) List<String> departurePlane,
            @RequestParam(name = "arrivals", required = false) List<String> arrivals,
            @RequestParam(name = "date_from", required = false) String dateFrom,
            @RequestParam(name = "date_to", required = false) String dateTo,
            @RequestParam(name = "adults", required = false) Integer adults,
            @RequestParam(name = "infants", required = false) Integer infants,
            @RequestParam(name = "kids", required = false) Integer kids,
            @RequestParam(name = "teens", required = false) Integer teens

    ) {

        Logger logger = Logger.getLogger("getOffersBasedOnSearchQuery");
        logger.info("Legacy tour product search shell requested; old offer composition is disabled");

        List<OfferDto> offerDtos = offersService.getOffersBasedOnSearchQuery(List.of(),
                List.of(),
                List.of(),
                dateFrom,
                dateTo,
                adults == null ? 0 : adults,
                infants == null ? 0 : infants,
                kids == null ? 0 : kids,
                teens == null ? 0 : teens);

        logger.info("Response size: " + offerDtos.size());
        return offerDtos;
    }

    public GetOfferDetailsResponseDto getOfferDetails(GetOfferDetailsRequestDto requestDto) {
        Logger logger = Logger.getLogger("getOfferDetails");
        logger.info("Request for hotel ID: " + requestDto.getIdHotel());

        requestDto.setDepartureBuses(requestDto.getDepartureBuses() != null ? requestDto.getDepartureBuses() : new ArrayList<>());
        requestDto.setDeparturePlanes(requestDto.getDeparturePlanes() != null ? requestDto.getDeparturePlanes() : new ArrayList<>());

        GetOfferDetailsResponseDto responseDto = offersService.getOfferDetails(requestDto);
        logger.info("Response: " + responseDto);

        return responseDto;
    }

    public BigDecimal getOfferPrice(GetOfferPriceRequestDto requestDto) {
        return offersService.getOfferPrice(requestDto);
    }
}
