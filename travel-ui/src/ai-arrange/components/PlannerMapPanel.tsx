import React, {useEffect, useMemo, useRef, useState} from "react";
import {Alert, Chip, Tooltip, Typography} from "@mui/material";
import {
    LocationOn,
    Map as MapIcon,
    Route as RouteIcon,
} from "@mui/icons-material";
import {
    PlannerPlaceSuggestion,
    PlannerRouteSegment,
} from "../../core/apiConfig";

type MapLoadState = "idle" | "loading" | "ready" | "fallback" | "error";

interface PositionedPlace extends PlannerPlaceSuggestion {
    x: number,
    y: number,
}

interface PlannerMapPanelProps {
    places: PlannerPlaceSuggestion[],
    routes: PlannerRouteSegment[],
    selectedPlaceIds: string[],
    readOnly: boolean,
    onTogglePlace: (placeId: string) => void,
}

interface AMapMap {
    add: (overlays: unknown[] | unknown) => void,
    addControl: (control: unknown) => void,
    clearMap: () => void,
    destroy: () => void,
    setFitView: (overlays?: unknown[], immediately?: boolean, avoid?: number[]) => void,
}

interface AMapMarker {
    on: (eventName: string, handler: () => void) => void,
}

interface AMapNamespace {
    Map: new (container: HTMLDivElement, options: Record<string, unknown>) => AMapMap,
    Marker: new (options: Record<string, unknown>) => AMapMarker,
    Pixel: new (x: number, y: number) => unknown,
    Polyline: new (options: Record<string, unknown>) => unknown,
    Scale?: new () => unknown,
    ToolBar?: new (options?: Record<string, unknown>) => unknown,
}

declare global {
    interface Window {
        AMapLoader?: {
            load: (options: Record<string, unknown>) => Promise<AMapNamespace>,
        },
        _AMapSecurityConfig?: {
            securityJsCode?: string,
        },
    }
}

const AMAP_LOADER_URL = "https://webapi.amap.com/loader.js";
let amapLoaderPromise: Promise<AMapNamespace> | null = null;

const amapJsApiKey = process.env.REACT_APP_AMAP_JS_API_KEY || process.env.REACT_APP_AMAP_API_KEY || "";
const amapSecurityJsCode = process.env.REACT_APP_AMAP_SECURITY_JS_CODE || "";

function loadAmapApi(): Promise<AMapNamespace> {
    if (amapLoaderPromise) return amapLoaderPromise;

    amapLoaderPromise = new Promise((resolve, reject) => {
        if (amapSecurityJsCode) {
            window._AMapSecurityConfig = {
                securityJsCode: amapSecurityJsCode,
            };
        }

        const existingLoader = window.AMapLoader;
        if (existingLoader) {
            existingLoader.load({
                key: amapJsApiKey,
                version: "2.0",
                plugins: ["AMap.Scale", "AMap.ToolBar"],
            }).then(resolve).catch(reject);
            return;
        }

        const script = document.createElement("script");
        script.src = AMAP_LOADER_URL;
        script.async = true;
        script.onload = () => {
            if (!window.AMapLoader) {
                reject(new Error("AMapLoader unavailable"));
                return;
            }
            window.AMapLoader.load({
                key: amapJsApiKey,
                version: "2.0",
                plugins: ["AMap.Scale", "AMap.ToolBar"],
            }).then(resolve).catch(reject);
        };
        script.onerror = () => reject(new Error("AMap loader failed"));
        document.head.appendChild(script);
    });

    return amapLoaderPromise;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function placeTypeToMapColor(type?: string, selected?: boolean) {
    if (selected) return "#19857b";
    if (type === "HOTEL") return "#9c27b0";
    if (type === "RESTAURANT") return "#ef6c00";
    if (type === "SCENIC") return "#2563eb";
    return "#556cd6";
}

function markerContent(index: number, selected: boolean, type?: string) {
    const color = placeTypeToMapColor(type, selected);
    const borderColor = selected ? "#145c56" : "#ffffff";
    return `
        <div style="
            width: 32px;
            height: 32px;
            border-radius: 18px 18px 18px 4px;
            transform: rotate(-45deg);
            border: 2px solid ${borderColor};
            background: ${color};
            box-shadow: 0 8px 18px rgba(31, 41, 55, 0.24);
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            <span style="
                transform: rotate(45deg);
                color: #ffffff;
                font-size: 13px;
                font-weight: 700;
                line-height: 1;
            ">${index}</span>
        </div>
    `;
}

function normalizePositions(places: PlannerPlaceSuggestion[]): PositionedPlace[] {
    const validPlaces = places.filter(place => isFiniteNumber(place.latitude) && isFiniteNumber(place.longitude));
    if (validPlaces.length === 0) return [];

    const latitudes = validPlaces.map(place => place.latitude as number);
    const longitudes = validPlaces.map(place => place.longitude as number);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);
    const latSpan = Math.max(maxLat - minLat, 0.001);
    const lngSpan = Math.max(maxLng - minLng, 0.001);

    return validPlaces.map(place => {
        const longitude = place.longitude as number;
        const latitude = place.latitude as number;
        return {
            ...place,
            x: 10 + ((longitude - minLng) / lngSpan) * 80,
            y: 90 - ((latitude - minLat) / latSpan) * 80,
        };
    });
}

function parsePolyline(polyline?: string): [number, number][] {
    if (!polyline) return [];
    return polyline
        .split(";")
        .map(point => point.split(",").map(value => Number(value.trim())))
        .filter((point): point is [number, number] => point.length === 2 && point.every(Number.isFinite));
}

function routePathFromPlaces(
    route: PlannerRouteSegment,
    placesById: Map<string, PlannerPlaceSuggestion>,
): [number, number][] {
    const parsedPath = parsePolyline(route.polyline);
    if (parsedPath.length > 1) return parsedPath;

    if (!route.fromPlaceId || !route.toPlaceId) return [];
    const from = placesById.get(route.fromPlaceId);
    const to = placesById.get(route.toPlaceId);
    if (!from || !to) return [];
    if (!isFiniteNumber(from.longitude) || !isFiniteNumber(from.latitude)) return [];
    if (!isFiniteNumber(to.longitude) || !isFiniteNumber(to.latitude)) return [];
    return [[from.longitude, from.latitude], [to.longitude, to.latitude]];
}

function MockMapCanvas({
    places,
    routes,
    selectedPlaceIds,
    readOnly,
    onTogglePlace,
}: PlannerMapPanelProps) {
    const positionedPlaces = useMemo(() => normalizePositions(places), [places]);
    const positionedById = useMemo(() => {
        const map = new Map<string, PositionedPlace>();
        positionedPlaces.forEach(place => map.set(place.placeId, place));
        return map;
    }, [positionedPlaces]);

    return (
        <>
            <div
                className="absolute inset-0 opacity-70"
                style={{
                    backgroundImage: "linear-gradient(#d6e5df 1px, transparent 1px), linear-gradient(90deg, #d6e5df 1px, transparent 1px)",
                    backgroundSize: "42px 42px",
                }}
            />
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
                {routes.map((route, index) => {
                    if (!route.fromPlaceId || !route.toPlaceId) return null;
                    const from = positionedById.get(route.fromPlaceId);
                    const to = positionedById.get(route.toPlaceId);
                    if (!from || !to) return null;
                    return (
                        <line
                            key={`${route.fromPlaceId}-${route.toPlaceId}-${index}`}
                            x1={`${from.x}%`}
                            y1={`${from.y}%`}
                            x2={`${to.x}%`}
                            y2={`${to.y}%`}
                            stroke="#556cd6"
                            strokeWidth="3"
                            strokeDasharray="7 7"
                            strokeLinecap="round"
                        />
                    );
                })}
            </svg>

            {positionedPlaces.length === 0 &&
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-10 text-center text-gray-500">
                    <LocationOn style={{fontSize: 44}}/>
                    <Typography>AI 生成点位后会在这里显示位置</Typography>
                </div>
            }

            {positionedPlaces.map((place, index) => {
                const selected = selectedPlaceIds.includes(place.placeId);
                return (
                    <Tooltip key={place.placeId} title={place.name} arrow>
                        <button
                            type="button"
                            disabled={readOnly}
                            className={`absolute flex h-10 w-10 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border-2 bg-white shadow-md transition ${
                                selected ? "border-[#19857b] text-[#19857b]" : "border-[#556cd6] text-[#556cd6]"
                            } ${readOnly ? "cursor-not-allowed opacity-70" : "hover:scale-105"}`}
                            style={{left: `${place.x}%`, top: `${place.y}%`}}
                            onClick={() => onTogglePlace(place.placeId)}
                            aria-label={`选择 ${place.name}`}
                        >
                            <span className="text-sm font-semibold">{index + 1}</span>
                        </button>
                    </Tooltip>
                );
            })}
        </>
    );
}

function AmapCanvas({
    places,
    routes,
    selectedPlaceIds,
    readOnly,
    onTogglePlace,
    onLoadStateChange,
}: PlannerMapPanelProps & {onLoadStateChange: (state: MapLoadState) => void}) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<AMapMap | null>(null);
    const [amapApi, setAmapApi] = useState<AMapNamespace | null>(null);

    useEffect(() => {
        if (!amapJsApiKey) {
            onLoadStateChange("fallback");
            return;
        }

        let disposed = false;
        onLoadStateChange("loading");

        loadAmapApi()
            .then(api => {
                if (disposed || !containerRef.current) return;
                if (!mapRef.current) {
                    mapRef.current = new api.Map(containerRef.current, {
                        zoom: 12,
                        viewMode: "2D",
                        resizeEnable: true,
                    });
                    if (api.Scale) {
                        mapRef.current.addControl(new api.Scale());
                    }
                    if (api.ToolBar) {
                        mapRef.current.addControl(new api.ToolBar({position: "RB"}));
                    }
                }
                setAmapApi(api);
                onLoadStateChange("ready");
            })
            .catch(error => {
                console.error(error);
                onLoadStateChange("error");
            });

        return () => {
            disposed = true;
        };
    }, [onLoadStateChange]);

    useEffect(() => {
        return () => {
            mapRef.current?.destroy();
            mapRef.current = null;
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !amapApi) return;

        const placesById = new Map<string, PlannerPlaceSuggestion>();
        places.forEach(place => placesById.set(place.placeId, place));
        const overlays: unknown[] = [];

        routes.forEach(route => {
            const path = routePathFromPlaces(route, placesById);
            if (path.length < 2) return;
            overlays.push(new amapApi.Polyline({
                path,
                strokeColor: "#556cd6",
                strokeOpacity: 0.78,
                strokeWeight: 5,
                strokeStyle: "dashed",
                lineJoin: "round",
            }));
        });

        places.forEach((place, index) => {
            if (!isFiniteNumber(place.longitude) || !isFiniteNumber(place.latitude)) return;
            const selected = selectedPlaceIds.includes(place.placeId);
            const marker = new amapApi.Marker({
                position: [place.longitude, place.latitude],
                title: place.name,
                content: markerContent(index + 1, selected, place.type),
                offset: new amapApi.Pixel(-16, -32),
                zIndex: selected ? 120 : 100,
            });
            marker.on("click", () => {
                if (!readOnly) {
                    onTogglePlace(place.placeId);
                }
            });
            overlays.push(marker);
        });

        map.clearMap();
        if (overlays.length > 0) {
            map.add(overlays);
            map.setFitView(overlays, false, [64, 64, 64, 64]);
        }
    }, [amapApi, onTogglePlace, places, readOnly, routes, selectedPlaceIds]);

    return <div ref={containerRef} className="absolute inset-0"/>;
}

function routeLabel(route: PlannerRouteSegment) {
    const distance = route.distanceKm ? `${route.distanceKm}km` : "";
    return route.summary || `${route.transportMode || "路线"} ${distance}`.trim();
}

export function PlannerMapPanel(props: PlannerMapPanelProps) {
    const {places, routes} = props;
    const [mapLoadState, setMapLoadState] = useState<MapLoadState>(amapJsApiKey ? "idle" : "fallback");
    const showAmap = Boolean(amapJsApiKey) && mapLoadState !== "error" && mapLoadState !== "fallback";
    const showMockMap = !showAmap;
    const mapModeLabel = showAmap && mapLoadState === "ready" ? "高德地图" : "模拟地图";

    return (
        <section className="flex min-h-[420px] flex-[0.85] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
                <div className="flex items-center gap-2">
                    <MapIcon style={{color: "#556cd6"}}/>
                    <Typography variant="h6">地图点位</Typography>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <Chip label={mapModeLabel} size="small" color={showAmap ? "success" : "default"} variant="outlined"/>
                    <Chip label={`${places.length} 个推荐`} size="small" color="primary" variant="outlined"/>
                </div>
            </div>

            {mapLoadState === "error" &&
                <Alert severity="warning" className="mx-4 mt-3">
                    高德地图暂时不可用，已切换到模拟地图。
                </Alert>
            }

            <div className="relative min-h-[320px] flex-1 overflow-hidden bg-[#eef5f2]">
                {showAmap &&
                    <AmapCanvas
                        {...props}
                        onLoadStateChange={setMapLoadState}
                    />
                }
                {showMockMap &&
                    <MockMapCanvas {...props}/>
                }
            </div>

            <div className="max-h-32 shrink-0 overflow-y-auto border-t border-gray-200 bg-white px-4 py-3">
                {routes.length === 0 &&
                    <Typography variant="body2" color="text.secondary">路线会在 AI 形成完整行程后同步。</Typography>
                }
                {routes.map((route, index) => (
                    <div key={`${route.fromPlaceId}-${route.toPlaceId}-${index}`} className="mb-2 flex items-center gap-2 text-sm text-gray-700">
                        <RouteIcon style={{fontSize: 18, color: "#556cd6"}}/>
                        <span>{routeLabel(route)}</span>
                        {route.estimatedMinutes && <span className="text-gray-500">约 {route.estimatedMinutes} 分钟</span>}
                    </div>
                ))}
            </div>
        </section>
    );
}

