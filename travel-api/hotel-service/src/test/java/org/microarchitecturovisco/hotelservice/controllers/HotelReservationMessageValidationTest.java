package org.microarchitecturovisco.hotelservice.controllers;

import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.hotelservice.services.AdminAuthorizationService;
import org.microarchitecturovisco.hotelservice.services.HotelsCommandService;
import org.microarchitecturovisco.hotelservice.services.HotelsService;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class HotelReservationMessageValidationTest {

    @Test
    void incompleteReservationMessageFailsBeforeBusinessWrites() {
        HotelsCommandService commands = mock(HotelsCommandService.class);
        HotelsController controller = new HotelsController(
                mock(HotelsService.class), commands, mock(AdminAuthorizationService.class));

        assertThatThrownBy(() -> controller.consumeMessageCreateHotelReservation("{}"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("missing required fields");
        verifyNoInteractions(commands);
    }

    @Test
    void malformedJsonFailsBeforeBusinessWrites() {
        HotelsCommandService commands = mock(HotelsCommandService.class);
        HotelsController controller = new HotelsController(
                mock(HotelsService.class), commands, mock(AdminAuthorizationService.class));

        assertThatThrownBy(() -> controller.consumeMessageCreateHotelReservation("not-json"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid create-hotel-reservation message");
        verifyNoInteractions(commands);
    }

    @Test
    void jsonNullFailsAsDeterministicValidationError() {
        HotelsController controller = new HotelsController(null, null, null);

        assertThatThrownBy(() -> controller.consumeMessageCreateHotelReservation("null"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("missing required fields");
    }
}
