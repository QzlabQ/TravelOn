package org.microarchitecturovisco.hotelservice.bootstrap.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.microarchitecturovisco.hotelservice.model.domain.CateringType;
import org.microarchitecturovisco.hotelservice.model.dto.CateringOptionDto;
import org.microarchitecturovisco.hotelservice.model.dto.HotelDto;
import org.microarchitecturovisco.hotelservice.model.dto.LocationDto;
import org.microarchitecturovisco.hotelservice.model.dto.RoomDto;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class JsonHotelParser {
    private static final String DOMESTIC_COUNTRY = "中国";
    private static final List<String> FALLBACK_PHOTOS = List.of(
            "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80"
    );

    private final ObjectMapper objectMapper = new ObjectMapper();

    public List<HotelDto> importHotels(Resource resource) throws IOException {
        JsonNode hotelsNode = objectMapper.readTree(resource.getInputStream());
        List<HotelDto> hotels = new ArrayList<>();
        int index = 0;

        for (JsonNode hotelNode : hotelsNode) {
            HotelDto hotel = mapHotel(hotelNode, index++);
            if (hotel != null) {
                hotels.add(hotel);
            }
        }

        return hotels;
    }

    private HotelDto mapHotel(JsonNode hotelNode, int index) {
        String name = text(hotelNode, "name");
        String city = text(hotelNode, "city");
        String address = text(hotelNode, "address");
        if (name.isBlank() || city.isBlank()) {
            return null;
        }

        UUID hotelId = stableUuid("json-hotel:" + index + ":" + name + ":" + city + ":" + address);
        LocationDto location = LocationDto.builder()
                .idLocation(stableUuid(DOMESTIC_COUNTRY + city))
                .country(DOMESTIC_COUNTRY)
                .region(city)
                .build();

        return HotelDto.builder()
                .hotelId(hotelId)
                .name(name)
                .rating(readRating(hotelNode, hotelId))
                .description(buildDescription(hotelNode))
                .location(location)
                .photos(readPhotos(hotelNode, hotelId))
                .rooms(readRooms(hotelNode.path("room_info"), hotelId))
                .cateringOptions(readCateringOptions(hotelId))
                .build();
    }

    private String buildDescription(JsonNode hotelNode) {
        List<String> parts = new ArrayList<>();
        String address = text(hotelNode, "address");
        String station = text(hotelNode, "station");
        String info = text(hotelNode, "info");
        String phone = readPhones(hotelNode.path("phone"));

        if (!address.isBlank()) {
            parts.add("地址：" + address + "。");
        }
        if (!station.isBlank()) {
            parts.add("近 " + station + "。");
        }
        if (!phone.isBlank()) {
            parts.add("电话：" + phone + "。");
        }
        if (!info.isBlank()) {
            parts.add(info);
        }

        return String.join(" ", parts);
    }

    private String readPhones(JsonNode phoneNode) {
        if (!phoneNode.isArray()) {
            return "";
        }

        List<String> phones = new ArrayList<>();
        for (JsonNode phone : phoneNode) {
            if (phone.isTextual() && !phone.asText().isBlank()) {
                phones.add(phone.asText());
            }
        }
        return String.join(" / ", phones);
    }

    private float readRating(JsonNode hotelNode, UUID hotelId) {
        JsonNode comments = hotelNode.path("comments");
        double total = 0;
        int count = 0;
        if (comments.isArray()) {
            for (JsonNode comment : comments) {
                if (comment.path("rating").isNumber()) {
                    total += comment.path("rating").asDouble();
                    count++;
                }
            }
        }

        double rating = count > 0
                ? total / count
                : 4.0 + Math.floorMod(hotelId.hashCode(), 10) / 10.0;
        rating = Math.max(3.0, Math.min(5.0, rating));
        return (float) (Math.round(rating * 10.0) / 10.0);
    }

    private List<String> readPhotos(JsonNode hotelNode, UUID hotelId) {
        List<String> photos = new ArrayList<>();
        JsonNode images = hotelNode.path("images");
        if (images.isArray()) {
            for (JsonNode image : images) {
                if (image.isTextual() && image.asText().startsWith("http")) {
                    photos.add(image.asText());
                }
            }
        }

        if (photos.isEmpty()) {
            int start = Math.floorMod(hotelId.hashCode(), FALLBACK_PHOTOS.size());
            photos.add(FALLBACK_PHOTOS.get(start));
            photos.add(FALLBACK_PHOTOS.get((start + 1) % FALLBACK_PHOTOS.size()));
        }
        return photos;
    }

    private List<RoomDto> readRooms(JsonNode roomInfoNode, UUID hotelId) {
        List<RoomDto> rooms = new ArrayList<>();
        if (roomInfoNode.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> fields = roomInfoNode.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> entry = fields.next();
                String roomName = entry.getKey();
                JsonNode roomNode = entry.getValue();
                float price = Math.max(80, (float) roomNode.path("price").asDouble(220));
                int inventory = Math.max(1, roomNode.path("capacity").asInt(1));
                int guestCapacity = inferGuestCapacity(roomName);

                rooms.add(RoomDto.builder()
                        .roomId(stableUuid("json-room:" + hotelId + ":" + roomName))
                        .hotelId(hotelId)
                        .name(roomName)
                        .guestCapacity(guestCapacity)
                        .pricePerAdult(price)
                        .description(roomName + "，样本房量 " + inventory + " 间，价格来自 hotels.json。")
                        .roomReservations(new ArrayList<>())
                        .build());
            }
        }

        if (rooms.isEmpty()) {
            rooms.add(RoomDto.builder()
                    .roomId(stableUuid("json-room:" + hotelId + ":标准间"))
                    .hotelId(hotelId)
                    .name("标准间")
                    .guestCapacity(2)
                    .pricePerAdult(220)
                    .description("标准间，系统根据酒店样本数据补充。")
                    .roomReservations(new ArrayList<>())
                    .build());
        }

        return rooms;
    }

    private List<CateringOptionDto> readCateringOptions(UUID hotelId) {
        return List.of(
                CateringOptionDto.builder()
                        .cateringId(stableUuid("json-catering:" + hotelId + ":BREAKFAST"))
                        .hotelId(hotelId)
                        .type(CateringType.BREAKFAST)
                        .rating(4.5f)
                        .price(38)
                        .build(),
                CateringOptionDto.builder()
                        .cateringId(stableUuid("json-catering:" + hotelId + ":NO_CATERING"))
                        .hotelId(hotelId)
                        .type(CateringType.NO_CATERING)
                        .rating(4.0f)
                        .price(0)
                        .build()
        );
    }

    private int inferGuestCapacity(String roomName) {
        if (roomName == null) {
            return 2;
        }
        if (roomName.contains("单人")) {
            return 1;
        }
        if (roomName.contains("家庭") || roomName.contains("亲子")) {
            return 4;
        }
        if (roomName.contains("套房")) {
            return 3;
        }
        return 2;
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isTextual() ? value.asText().trim() : "";
    }

    private UUID stableUuid(String source) {
        return UUID.nameUUIDFromBytes(source.getBytes(StandardCharsets.UTF_8));
    }
}
