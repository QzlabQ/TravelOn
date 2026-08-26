package org.microarchitecturovisco.offerprovider.domain.dto;

import lombok.Builder;
import lombok.Data;
import java.math.BigDecimal;

@Data
@Builder
public class OfferDto {
    private String idHotel;
    private String hotelName;
    private BigDecimal price;
    private String destination;
    private Float rating;
    private String imageUrl;
}
