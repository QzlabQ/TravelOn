package org.microarchitecturovisco.transport.bootstrap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.transport.model.domain.TicketOfferTemplate;
import org.microarchitecturovisco.transport.model.domain.TicketType;
import org.microarchitecturovisco.transport.repositories.TicketOfferTemplateRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.logging.Logger;

@Component
@Order(2)
@RequiredArgsConstructor
public class TicketOfferBootstrap implements CommandLineRunner {
    private static final int MAX_IMPORTED_TRAIN_OFFERS = 80_000;
    private static final LocalDate TRAIN_REFERENCE_DATE = LocalDate.of(2026, 6, 5);
    private static final Set<String> MAJOR_CITIES = Set.of(
            "北京", "上海", "广州", "深圳", "成都", "重庆", "西安", "武汉", "杭州", "南京",
            "天津", "郑州", "长沙", "昆明", "贵阳", "南宁", "福州", "厦门", "青岛", "济南",
            "太原", "石家庄", "沈阳", "大连", "哈尔滨", "长春", "呼和浩特", "乌鲁木齐", "兰州",
            "西宁", "银川", "拉萨", "海口", "三亚", "合肥", "南昌", "苏州", "宁波", "无锡",
            "佛山", "东莞", "珠海", "桂林", "张家界", "黄山", "洛阳", "敦煌", "丽江", "大理"
    );

    private final TicketOfferTemplateRepository ticketOfferTemplateRepository;
    private final ResourceLoader resourceLoader;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void run(String... args) throws Exception {
        Resource tsvResource = resourceLoader.getResource("classpath:initData/ticket_offers.tsv");
        Resource trainNumberResource = resourceLoader.getResource("classpath:initData/train_number.json");
        Resource trainTypeResource = resourceLoader.getResource("classpath:initData/train_type.json");
        Resource stationResource = resourceLoader.getResource("classpath:initData/station.json");

        List<TicketOfferTemplate> offers = new ArrayList<>(readTsvOffers(tsvResource));
        long tsvTrainOffers = offers.stream().filter(offer -> offer.getType() == TicketType.TRAIN).count();

        if (trainNumberResource.exists() && trainTypeResource.exists() && stationResource.exists()) {
            offers = new ArrayList<>(offers.stream()
                    .filter(offer -> offer.getType() != TicketType.TRAIN)
                    .toList());
            List<TicketOfferTemplate> trainOffers = readJsonTrainOffers(
                    trainNumberResource,
                    trainTypeResource,
                    stationResource
            );
            offers.addAll(trainOffers);
            Logger.getLogger("TicketOfferBootstrap").info("Imported " + trainOffers.size() +
                    " train offer templates from JSON instead of " + tsvTrainOffers + " TSV train rows");
        }

        ticketOfferTemplateRepository.deleteAll();
        ticketOfferTemplateRepository.saveAll(offers);
        Logger.getLogger("TicketOfferBootstrap").info("Imported " + offers.size() + " ticket offer templates");
    }

    private List<TicketOfferTemplate> readTsvOffers(Resource resource) throws IOException {
        List<TicketOfferTemplate> offers = new ArrayList<>();

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            reader.readLine();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }

                String[] values = line.split("\\t", -1);
                offers.add(TicketOfferTemplate.builder()
                        .id(UUID.nameUUIDFromBytes(line.getBytes(StandardCharsets.UTF_8)))
                        .type(TicketType.valueOf(values[0]))
                        .departureCity(values[1])
                        .arrivalCity(values[2])
                        .departureStation(values[3])
                        .arrivalStation(values[4])
                        .departureTime(LocalTime.parse(values[5]))
                        .arrivalTime(LocalTime.parse(values[6]))
                        .carrier(values[7])
                        .code(values[8])
                        .seatClass(values[9])
                        .price(Integer.parseInt(values[10]))
                        .remainingSeats(Integer.parseInt(values[11]))
                        .studentEligible(Boolean.parseBoolean(values[12]))
                        .referenceDate(LocalDate.parse(values[13]))
                        .sourceUrl(values[14])
                        .sourceNote(values[15])
                        .build());
            }
        }

        return offers;
    }

    private List<TicketOfferTemplate> readJsonTrainOffers(
            Resource trainNumberResource,
            Resource trainTypeResource,
            Resource stationResource
    ) throws IOException {
        Map<String, String> stationCities = readStationCities(stationResource);
        Map<String, List<SeatInfo>> seatInfosByType = readSeatInfos(trainTypeResource);
        Map<String, String> trainTypeNames = readTrainTypeNames(trainTypeResource);
        JsonNode trains = objectMapper.readTree(trainNumberResource.getInputStream());

        List<TicketOfferTemplate> offers = new ArrayList<>();
        for (JsonNode train : trains) {
            if (offers.size() >= MAX_IMPORTED_TRAIN_OFFERS) {
                break;
            }

            String trainNumber = requiredText(train, "train_number");
            String trainType = requiredText(train, "train_type");
            List<RouteStop> stops = readRouteStops(train.path("route"));
            if (trainNumber.isBlank() || trainType.isBlank() || stops.size() < 2) {
                continue;
            }

            List<SeatInfo> seatInfos = seatInfosByType.getOrDefault(trainType, List.of(defaultSeatInfo(trainType)));
            if (seatInfos.isEmpty()) {
                seatInfos = List.of(defaultSeatInfo(trainType));
            }

            int originDepartureSeconds = train.path("originDepatureTime").asInt(0);
            int fullTripSeconds = Math.max(1, arrivalSeconds(originDepartureSeconds, stops.get(stops.size() - 1)) -
                    departureSeconds(originDepartureSeconds, stops.get(0)));
            String carrier = "中国铁路 " + trainTypeNames.getOrDefault(trainType, trainType);

            for (int[] pair : buildSearchPairs(stops, stationCities)) {
                if (offers.size() >= MAX_IMPORTED_TRAIN_OFFERS) {
                    break;
                }

                RouteStop from = stops.get(pair[0]);
                RouteStop to = stops.get(pair[1]);
                int departureSeconds = departureSeconds(originDepartureSeconds, from);
                int arrivalSeconds = arrivalSeconds(originDepartureSeconds, to);
                int travelSeconds = Math.max(60, arrivalSeconds - departureSeconds);

                for (SeatInfo seatInfo : seatInfos.stream().limit(2).toList()) {
                    if (offers.size() >= MAX_IMPORTED_TRAIN_OFFERS) {
                        break;
                    }

                    String departureCity = cityForStation(stationCities, from.station());
                    String arrivalCity = cityForStation(stationCities, to.station());
                    int price = calculateSegmentPrice(seatInfo.price(), travelSeconds, fullTripSeconds);
                    int remainingSeats = deterministicRemainingSeats(trainNumber, from.station(), to.station(), seatInfo);
                    String idSource = String.join("\t", "json-train", trainNumber, from.station(), to.station(), seatInfo.seatClass());

                    offers.add(TicketOfferTemplate.builder()
                            .id(UUID.nameUUIDFromBytes(idSource.getBytes(StandardCharsets.UTF_8)))
                            .type(TicketType.TRAIN)
                            .departureCity(departureCity)
                            .arrivalCity(arrivalCity)
                            .departureStation(from.station())
                            .arrivalStation(to.station())
                            .departureTime(toLocalTime(departureSeconds))
                            .arrivalTime(toLocalTime(arrivalSeconds))
                            .carrier(carrier)
                            .code(trainNumber)
                            .seatClass(seatInfo.seatClass())
                            .price(price)
                            .remainingSeats(remainingSeats)
                            .studentEligible(isStudentEligible(trainType, seatInfo.seatClass()))
                            .referenceDate(TRAIN_REFERENCE_DATE)
                            .sourceUrl("https://www.12306.cn/")
                            .sourceNote("基于 train_number.json 的历史车次和 train_type.json 的座席模板生成；经停序号 " +
                                    from.order() + "-" + to.order() + "，原始车次 " + trainNumber + "。")
                            .build());
                }
            }
        }

        return offers;
    }

    private Map<String, String> readStationCities(Resource stationResource) throws IOException {
        Map<String, String> stationCities = new HashMap<>();
        JsonNode stations = objectMapper.readTree(stationResource.getInputStream());
        for (JsonNode station : stations) {
            String name = requiredText(station, "name");
            String city = normalizeCityName(requiredText(station, "city"));
            if (!name.isBlank() && !city.isBlank()) {
                stationCities.put(name, city);
            }
        }
        return stationCities;
    }

    private Map<String, List<SeatInfo>> readSeatInfos(Resource trainTypeResource) throws IOException {
        Map<String, List<SeatInfo>> seatInfosByType = new HashMap<>();
        JsonNode trainTypes = objectMapper.readTree(trainTypeResource.getInputStream());

        for (JsonNode trainType : trainTypes) {
            String typeId = requiredText(trainType, "id");
            JsonNode seatRoot = trainType.path("seat");
            List<SeatInfo> seatInfos = new ArrayList<>();
            Iterator<Map.Entry<String, JsonNode>> seatClasses = seatRoot.fields();
            while (seatClasses.hasNext()) {
                Map.Entry<String, JsonNode> seatClassEntry = seatClasses.next();
                String seatClass = seatClassEntry.getKey();
                int totalSeats = 0;
                int totalPrice = 0;

                Iterator<Map.Entry<String, JsonNode>> seatLocations = seatClassEntry.getValue().fields();
                while (seatLocations.hasNext()) {
                    JsonNode seats = seatLocations.next().getValue();
                    if (!seats.isArray()) {
                        continue;
                    }
                    for (JsonNode seat : seats) {
                        totalSeats++;
                        totalPrice += seat.path("price").asInt(0);
                    }
                }

                if (totalSeats > 0) {
                    seatInfos.add(new SeatInfo(seatClass, Math.max(20, Math.round((float) totalPrice / totalSeats)), totalSeats));
                }
            }
            seatInfos.sort(Comparator.comparingInt(info -> seatRank(info.seatClass())));
            seatInfosByType.put(typeId, seatInfos);
        }

        return seatInfosByType;
    }

    private Map<String, String> readTrainTypeNames(Resource trainTypeResource) throws IOException {
        Map<String, String> trainTypeNames = new HashMap<>();
        JsonNode trainTypes = objectMapper.readTree(trainTypeResource.getInputStream());
        for (JsonNode trainType : trainTypes) {
            trainTypeNames.put(requiredText(trainType, "id"), requiredText(trainType, "name"));
        }
        return trainTypeNames;
    }

    private List<RouteStop> readRouteStops(JsonNode routeNode) {
        List<RouteStop> stops = new ArrayList<>();
        if (!routeNode.isArray()) {
            return stops;
        }

        for (JsonNode stop : routeNode) {
            String station = requiredText(stop, "station");
            if (station.isBlank()) {
                continue;
            }
            stops.add(new RouteStop(
                    stop.path("order").asInt(0),
                    station,
                    stop.path("arrivalTime").asInt(0),
                    stop.path("depatureTime").asInt(0)
            ));
        }

        stops.sort(Comparator.comparingInt(RouteStop::order));
        return stops;
    }

    private List<int[]> buildSearchPairs(List<RouteStop> stops, Map<String, String> stationCities) {
        List<int[]> pairs = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        addPair(pairs, seen, 0, stops.size() - 1);

        for (int i = 0; i < stops.size() - 1; i++) {
            for (int j = i + 2; j < stops.size(); j++) {
                if (isMajorStop(stops.get(i), stationCities) && isMajorStop(stops.get(j), stationCities)) {
                    addPair(pairs, seen, i, j);
                }
            }
        }

        for (int i = 0; i < stops.size() - 1; i++) {
            addPair(pairs, seen, i, i + 1);
        }

        return pairs;
    }

    private void addPair(List<int[]> pairs, Set<String> seen, int from, int to) {
        String key = from + "-" + to;
        if (from < to && seen.add(key)) {
            pairs.add(new int[]{from, to});
        }
    }

    private boolean isMajorStop(RouteStop stop, Map<String, String> stationCities) {
        String city = cityForStation(stationCities, stop.station());
        return MAJOR_CITIES.contains(city) || MAJOR_CITIES.contains(normalizeCityName(stop.station()));
    }

    private int departureSeconds(int originDepartureSeconds, RouteStop stop) {
        int offset = stop.departureOffsetSeconds() > 0 ? stop.departureOffsetSeconds() : stop.arrivalOffsetSeconds();
        return originDepartureSeconds + offset;
    }

    private int arrivalSeconds(int originDepartureSeconds, RouteStop stop) {
        int offset = stop.arrivalOffsetSeconds() > 0 ? stop.arrivalOffsetSeconds() : stop.departureOffsetSeconds();
        return originDepartureSeconds + offset;
    }

    private LocalTime toLocalTime(int totalSeconds) {
        return LocalTime.ofSecondOfDay(Math.floorMod(totalSeconds, 24 * 60 * 60));
    }

    private int calculateSegmentPrice(int basePrice, int travelSeconds, int fullTripSeconds) {
        double ratio = Math.max(0.12, travelSeconds / (double) fullTripSeconds);
        int price = (int) Math.ceil((basePrice * ratio) / 5.0) * 5;
        return Math.max(20, price);
    }

    private int deterministicRemainingSeats(String trainNumber, String from, String to, SeatInfo seatInfo) {
        int bounded = 6 + Math.floorMod((trainNumber + from + to + seatInfo.seatClass()).hashCode(), 56);
        return Math.min(seatInfo.remainingSeats(), bounded);
    }

    private boolean isStudentEligible(String trainType, String seatClass) {
        return Set.of("G", "D", "C", "K", "T", "Z").contains(trainType) &&
                (seatClass.contains("二等") || seatClass.contains("硬座") || seatClass.contains("无座"));
    }

    private String cityForStation(Map<String, String> stationCities, String station) {
        return stationCities.getOrDefault(station, normalizeCityName(station));
    }

    private String normalizeCityName(String city) {
        if (city == null) {
            return "";
        }
        String normalized = city.trim();
        if (normalized.endsWith("市") && normalized.length() > 1) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private String requiredText(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isTextual() ? value.asText().trim() : "";
    }

    private SeatInfo defaultSeatInfo(String trainType) {
        String seatClass = Set.of("G", "D", "C").contains(trainType) ? "二等座" : "硬座";
        int price = Set.of("G", "D", "C").contains(trainType) ? 220 : 90;
        return new SeatInfo(seatClass, price, 80);
    }

    private int seatRank(String seatClass) {
        Map<String, Integer> ranks = new LinkedHashMap<>();
        ranks.put("商务", 0);
        ranks.put("特等", 1);
        ranks.put("一等", 2);
        ranks.put("二等", 3);
        ranks.put("软卧", 4);
        ranks.put("硬卧", 5);
        ranks.put("硬座", 6);
        ranks.put("无座", 7);

        for (Map.Entry<String, Integer> entry : ranks.entrySet()) {
            if (seatClass.contains(entry.getKey())) {
                return entry.getValue();
            }
        }
        return 99;
    }

    private record SeatInfo(String seatClass, int price, int remainingSeats) {
    }

    private record RouteStop(int order, String station, int arrivalOffsetSeconds, int departureOffsetSeconds) {
    }
}
