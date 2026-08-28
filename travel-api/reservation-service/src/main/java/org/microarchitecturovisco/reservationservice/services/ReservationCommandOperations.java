package org.microarchitecturovisco.reservationservice.services;

import org.microarchitecturovisco.reservationservice.domain.commands.CreateReservationCommand;
import org.microarchitecturovisco.reservationservice.domain.commands.DeleteReservationCommand;
import org.microarchitecturovisco.reservationservice.domain.commands.UpdateReservationCommand;
import org.microarchitecturovisco.reservationservice.domain.events.ReservationEvent;

import java.util.List;

public interface ReservationCommandOperations {

    List<ReservationEvent> handleCreateReservationCommand(CreateReservationCommand command);

    List<ReservationEvent> handleDeleteReservationCommand(DeleteReservationCommand command);

    List<ReservationEvent> handleReservationUpdateCommand(UpdateReservationCommand command);
}
