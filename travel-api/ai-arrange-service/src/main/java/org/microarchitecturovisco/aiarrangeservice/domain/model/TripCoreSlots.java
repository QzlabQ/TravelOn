package org.microarchitecturovisco.aiarrangeservice.domain.model;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TripCoreSlots {

    @NotBlank
    private String city;

    @NotNull
    private LocalDate travelStartDate;

    private LocalDate travelEndDate;

    @NotNull
    @Min(1)
    private Integer peopleCount;

    private String budget;
    private String travelStyle;
    private String accommodationPreference;
    private String transportPreference;
    private String notes;

    @Builder.Default
    private List<String> mustVisitKeywords = new ArrayList<>();

    @Builder.Default
    private List<String> avoidKeywords = new ArrayList<>();

    public boolean hasRequiredSlots() {
        return city != null && !city.isBlank() && travelStartDate != null && peopleCount != null && peopleCount > 0;
    }

    public LocalDate normalizedEndDate() {
        return travelEndDate != null ? travelEndDate : travelStartDate;
    }
}
