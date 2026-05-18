package org.microarchitecturovisco.aiarrangeservice.domain.model.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.microarchitecturovisco.aiarrangeservice.domain.model.TripCoreSlots;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdatePlannerCoreSlotsRequest {

    @NotNull
    private UUID userId;

    @Valid
    @NotNull
    private TripCoreSlots coreSlots;
}
