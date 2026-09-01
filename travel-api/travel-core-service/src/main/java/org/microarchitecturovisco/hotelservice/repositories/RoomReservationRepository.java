package org.microarchitecturovisco.hotelservice.repositories;

import org.microarchitecturovisco.hotelservice.model.domain.RoomReservation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface RoomReservationRepository extends JpaRepository<RoomReservation, UUID> {
    List<RoomReservation> findByMainReservationId(UUID mainReservationId);
    boolean existsByMainReservationIdAndRoomId(UUID mainReservationId, Long roomId);
    @Modifying
    @Query(value = "INSERT INTO room_reservation (id, date_from, date_to, main_reservation_id, room_id) "
            + "VALUES (:id, :dateFrom, :dateTo, :mainReservationId, :roomId) "
            + "ON CONFLICT (main_reservation_id, room_id) DO NOTHING", nativeQuery = true)
    int insertIfAbsent(@Param("id") UUID id,
                       @Param("dateFrom") java.time.LocalDateTime dateFrom,
                       @Param("dateTo") java.time.LocalDateTime dateTo,
                       @Param("mainReservationId") UUID mainReservationId,
                       @Param("roomId") Long roomId);
    void deleteByMainReservationId(UUID mainReservationId);
}
