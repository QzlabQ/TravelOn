export function buildPlannerContextMessage(dayIndex, selectedPlaceNames, selectedPreferenceLabels) {
    const places = (selectedPlaceNames || []).filter(Boolean);
    const preferences = (selectedPreferenceLabels || []).filter(Boolean);
    if (places.length > 0 && preferences.length > 0) {
        return `请基于第 ${dayIndex} 天已选地点：${places.join("、")}，并应用偏好：${preferences.join("、")}，优化当天行程。`;
    }
    if (places.length > 0) {
        return `请基于第 ${dayIndex} 天已选地点：${places.join("、")}，优化当天行程。`;
    }
    if (preferences.length > 0) {
        return `请将第 ${dayIndex} 天行程应用偏好：${preferences.join("、")}并重新优化。`;
    }
    return `请基于第 ${dayIndex} 天当前行程进行优化。`;
}
