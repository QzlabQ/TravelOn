package cloud.project.datagenerator.hotels.bootstrap;

import cloud.project.datagenerator.hotels.bootstrap.util.HotelParser;
import cloud.project.datagenerator.hotels.bootstrap.util.RoomParser;
import cloud.project.datagenerator.hotels.domain.Hotel;
import cloud.project.datagenerator.hotels.repositories.HotelRepository;
import cloud.project.datagenerator.hotels.repositories.RoomRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.logging.Logger;

@Component
@RequiredArgsConstructor
public class HotelBootstrap implements CommandLineRunner {
    private final HotelParser hotelParser;
    private final RoomParser roomParser;
    private final ResourceLoader resourceLoader;
    private final HotelRepository hotelRepository;
    private final RoomRepository roomRepository;

    @Value("${app.seed-data.base-path:file:../seed-data/hotel/}")
    private String seedDataBasePath;

    @Override
    public void run(String... args) throws IOException {
        Logger logger = Logger.getLogger("TransportBootstrap");

        if (hotelRepository.count() > 0) {
            logger.info("Skip data-generator hotel seed import because hotel data already exists.");
            return;
        }

        Resource hotelCsvFile = seedResource("hotels.csv");
        Resource hotelRoomsCsvFile = seedResource("hotel_rooms.csv");

        List<Hotel> hotels = hotelParser.importHotels(hotelCsvFile);
        roomParser.importRooms(hotelRoomsCsvFile, hotels);

        // Save hotels and rooms to the database
        hotels.forEach(hotel -> {
            hotelRepository.save(hotel);
            roomRepository.saveAll(hotel.getRooms());
        });

        logger.info("Hotels and rooms have been imported and saved to the database.");
    }

    private Resource seedResource(String filename) {
        String basePath = seedDataBasePath.endsWith("/") ? seedDataBasePath : seedDataBasePath + "/";
        return resourceLoader.getResource(basePath + filename);
    }
}
