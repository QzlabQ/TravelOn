package org.microarchitecturovisco.hotelservice.repositories;

import org.microarchitecturovisco.hotelservice.model.domain.Room;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface RoomRepository extends JpaRepository<Room, Long> {
    @Query("SELECT COALESCE(MAX(r.id), 0) FROM Room r")
    long findMaxId();

    @Query("SELECT DISTINCT r FROM Room r " +
            "JOIN r.hotel h " +
            "JOIN h.location l " +
            "WHERE l.id IN :arrivalLocationIds " +
            "AND NOT EXISTS (SELECT 1 FROM RoomReservation rr " +
            "                WHERE rr.room = r " +
            "                AND rr.dateFrom < :dateTo " +
            "                AND rr.dateTo > :dateFrom)")
    List<Room> findAvailableRoomsByLocationAndDate(
            @Param("arrivalLocationIds") List<UUID> arrivalLocationIds,
            @Param("dateFrom") LocalDateTime dateFrom,
            @Param("dateTo") LocalDateTime dateTo);

    @Query("SELECT DISTINCT r FROM Room r " +
            "JOIN r.hotel h " +
            "WHERE h.id = :hotelId " +
            "AND NOT EXISTS (SELECT 1 FROM RoomReservation rr " +
            "                WHERE rr.room = r " +
            "                AND rr.dateFrom < :dateTo " +
            "                AND rr.dateTo > :dateFrom)")
    List<Room> findAvailableRoomsByHotelAndDate(
            @Param("hotelId") Integer hotelId,
            @Param("dateFrom") LocalDateTime dateFrom,
            @Param("dateTo") LocalDateTime dateTo);

    @Query("SELECT r FROM Room r WHERE r.hotel.id = :hotelId")
    List<Room> findAllRoomsByHotelId(@Param("hotelId") Integer hotelId);
}

