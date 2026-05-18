import React, {FormEvent, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {
    Alert,
    Box,
    Button,
    Chip,
    Divider,
    IconButton,
    LinearProgress,
    MenuItem,
    Paper,
    TextField,
    Tooltip,
    Typography
} from "@mui/material";
import {DatePicker} from "@mui/x-date-pickers";
import dayjs, {Dayjs} from "dayjs";
import {v4 as uuidv4} from "uuid";
import {
    AutoAwesome,
    BookmarkAdd,
    CalendarMonth,
    CheckCircle,
    Close,
    EditNote,
    Group,
    History,
    Hotel,
    LocationOn,
    Map as MapIcon,
    RestartAlt,
    Route as RouteIcon,
    Send,
    TravelExplore
} from "@mui/icons-material";
import {
    ApiRequests,
    buildPlannerWebSocketUrl,
    CreatePlannerConversationPayload,
    PlannerChatStreamPayload,
    PlannerConversationResponse,
    PlannerCoreSlots,
    PlannerDataRefreshPayload,
    PlannerPlaceSuggestion,
    PlannerRouteSegment,
    PlannerSnapshot,
    PlannerSocketEnvelope
} from "../../core/apiConfig";

type SocketStatus = "idle" | "connecting" | "connected" | "closed" | "error";
type SnapshotView = "latest" | number;

interface ChatMessage {
    id: string,
    role: "user" | "assistant" | "system",
    text: string,
    streaming?: boolean,
}

interface PlannerFormState {
    city: string,
    travelStartDate: string,
    travelEndDate: string,
    peopleCount: number,
    travelStyle: string,
    budget: string,
    accommodationPreference: string,
    transportPreference: string,
    mustVisitKeywords: string,
    avoidKeywords: string,
    notes: string,
}

interface PlannerViewData {
    title: string,
    summary: string,
    markdown: string,
    places: PlannerPlaceSuggestion[],
    routes: PlannerRouteSegment[],
    selectedPlaceIds: string[],
    snapshotVersion: number | null,
}

interface PlannerStoredSession {
    userId: string,
    form: PlannerFormState,
    conversation: PlannerConversationResponse | null,
    chatMessages: ChatMessage[],
    chatInput: string,
    liveData: PlannerViewData,
    displayData: PlannerViewData,
    snapshots: PlannerSnapshot[],
    viewingSnapshotVersion: SnapshotView,
}

interface PositionedPlace extends PlannerPlaceSuggestion {
    x: number,
    y: number,
}

const DEFAULT_DEV_USER_ID = "00000000-0000-0000-0000-000000000001";
const PLANNER_STORAGE_KEY = "travel-ui.ai-planner.session.v1";

function defaultPlannerForm(): PlannerFormState {
    return {
        city: "上海",
        travelStartDate: "2026-06-01",
        travelEndDate: "2026-06-03",
        peopleCount: 2,
        travelStyle: "轻松 citywalk + 经典地标",
        budget: "",
        accommodationPreference: "",
        transportPreference: "",
        mustVisitKeywords: "",
        avoidKeywords: "",
        notes: "",
    };
}

function emptyPlannerView(): PlannerViewData {
    return {
        title: "行前智能规划",
        summary: "",
        markdown: "",
        places: [],
        routes: [],
        selectedPlaceIds: [],
        snapshotVersion: null,
    };
}

function readStoredPlannerSession(): PlannerStoredSession | null {
    try {
        const raw = localStorage.getItem(PLANNER_STORAGE_KEY);
        return raw ? JSON.parse(raw) as PlannerStoredSession : null;
    } catch {
        return null;
    }
}

function normalizeFormState(value?: Partial<PlannerFormState> | null): PlannerFormState {
    const defaults = defaultPlannerForm();
    return {
        ...defaults,
        ...value,
        peopleCount: Math.max(1, Number(value?.peopleCount ?? defaults.peopleCount) || defaults.peopleCount),
    };
}

function dateValue(value: string): Dayjs | null {
    if (!value) return null;
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed : null;
}

function formatPlannerDate(date: Dayjs | null) {
    return date && date.isValid() ? date.format("YYYY-MM-DD") : "";
}

function splitKeywords(value: string) {
    return value
        .split(/[,，、\n]/)
        .map(item => item.trim())
        .filter(Boolean);
}

function joinKeywords(value?: string[]) {
    return value && value.length > 0 ? value.join("、") : "";
}

function formFromCoreSlots(slots: PlannerCoreSlots): PlannerFormState {
    return normalizeFormState({
        city: slots.city || "",
        travelStartDate: slots.travelStartDate || "",
        travelEndDate: slots.travelEndDate || "",
        peopleCount: slots.peopleCount || 1,
        travelStyle: slots.travelStyle || "",
        budget: slots.budget || "",
        accommodationPreference: slots.accommodationPreference || "",
        transportPreference: slots.transportPreference || "",
        mustVisitKeywords: joinKeywords(slots.mustVisitKeywords),
        avoidKeywords: joinKeywords(slots.avoidKeywords),
        notes: slots.notes || "",
    });
}

function viewDataFromConversation(conversation?: PlannerConversationResponse | null): PlannerViewData {
    if (!conversation) return emptyPlannerView();
    return {
        ...emptyPlannerView(),
        title: conversation.title || `${conversation.coreSlots?.city || ""} 行前规划`,
        markdown: conversation.currentMarkdown || "",
        selectedPlaceIds: conversation.selectedPlaceIds || [],
        snapshotVersion: conversation.latestSnapshotVersion ?? null,
    };
}

function viewDataFromSnapshot(snapshot: PlannerSnapshot): PlannerViewData {
    return {
        title: snapshot.title || "行前智能规划",
        summary: snapshot.summary || "",
        markdown: snapshot.markdown || "",
        places: snapshot.places || [],
        routes: snapshot.routes || [],
        selectedPlaceIds: snapshot.selectedPlaceIds || [],
        snapshotVersion: snapshot.version ?? null,
    };
}

function viewDataFromRefresh(payload: PlannerDataRefreshPayload): PlannerViewData {
    return {
        title: payload.title || "行前智能规划",
        summary: payload.summary || "",
        markdown: payload.markdown || "",
        places: payload.places || [],
        routes: payload.routes || [],
        selectedPlaceIds: payload.selectedPlaceIds || [],
        snapshotVersion: payload.snapshotVersion ?? null,
    };
}

function sortSnapshots(snapshots: PlannerSnapshot[]) {
    return [...snapshots].sort((left, right) => (right.version || 0) - (left.version || 0));
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function placeTypeToLabel(type?: string) {
    if (type === "SCENIC") return "景点";
    if (type === "RESTAURANT") return "餐厅";
    if (type === "HOTEL") return "酒店";
    if (type === "TRANSPORT") return "交通";
    if (type === "SHOPPING") return "购物";
    return "推荐";
}

function sourceToLabel(source?: string) {
    if (source === "AMAP") return "高德";
    if (source === "INTERNAL_OFFER") return "自营";
    return "AI";
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

function buildInitialPrompt(slots: PlannerCoreSlots) {
    const dateRange = slots.travelEndDate ? `${slots.travelStartDate} 至 ${slots.travelEndDate}` : slots.travelStartDate;
    return [
        `请基于我的基础信息，先生成一版 ${slots.city} 行前智能规划。`,
        `日期：${dateRange}`,
        `人数：${slots.peopleCount}`,
        slots.travelStyle ? `旅行偏好：${slots.travelStyle}` : "",
        slots.budget ? `预算：${slots.budget}` : "",
        slots.accommodationPreference ? `住宿偏好：${slots.accommodationPreference}` : "",
        slots.transportPreference ? `交通偏好：${slots.transportPreference}` : "",
        slots.mustVisitKeywords && slots.mustVisitKeywords.length > 0 ? `想去：${slots.mustVisitKeywords.join("、")}` : "",
        slots.avoidKeywords && slots.avoidKeywords.length > 0 ? `避开：${slots.avoidKeywords.join("、")}` : "",
        slots.notes ? `补充：${slots.notes}` : "",
        "请用 Markdown 输出，并同步给出可选择的地图点位。"
    ].filter(Boolean).join("\n");
}

function PlannerMapPanel({
    places,
    routes,
    selectedPlaceIds,
    readOnly,
    onTogglePlace,
}: {
    places: PlannerPlaceSuggestion[],
    routes: PlannerRouteSegment[],
    selectedPlaceIds: string[],
    readOnly: boolean,
    onTogglePlace: (placeId: string) => void,
}) {
    const positionedPlaces = useMemo(() => normalizePositions(places), [places]);
    const positionedById = useMemo(() => {
        const map = new Map<string, PositionedPlace>();
        positionedPlaces.forEach(place => map.set(place.placeId, place));
        return map;
    }, [positionedPlaces]);

    return (
        <section className="flex min-h-0 flex-[1.35] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
                <div className="flex items-center gap-2">
                    <MapIcon style={{color: "#556cd6"}}/>
                    <Typography variant="h6">地图点位</Typography>
                </div>
                <Chip label={`${places.length} 个推荐`} size="small" color="primary" variant="outlined"/>
            </div>

            <div className="relative min-h-[260px] flex-1 bg-[#eef5f2]">
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
            </div>

            <div className="max-h-32 shrink-0 overflow-y-auto border-t border-gray-200 bg-white px-4 py-3">
                {routes.length === 0 &&
                    <Typography variant="body2" color="text.secondary">路线会在 AI 形成完整行程后同步。</Typography>
                }
                {routes.map((route, index) => (
                    <div key={`${route.fromPlaceId}-${route.toPlaceId}-${index}`} className="mb-2 flex items-center gap-2 text-sm text-gray-700">
                        <RouteIcon style={{fontSize: 18, color: "#556cd6"}}/>
                        <span>{route.summary || `${route.transportMode || "路线"} ${route.distanceKm ? `${route.distanceKm}km` : ""}`}</span>
                        {route.estimatedMinutes && <span className="text-gray-500">约 {route.estimatedMinutes} 分钟</span>}
                    </div>
                ))}
            </div>
        </section>
    );
}

export default function AiPlanner() {
    const navigate = useNavigate();
    const plannerWSRef = useRef<WebSocket | null>(null);
    const activeAssistantMessageIdRef = useRef<string | null>(null);
    const pendingInitialPromptRef = useRef<{conversationId: string, prompt: string} | null>(null);
    const viewingSnapshotVersionRef = useRef<SnapshotView>("latest");
    const selectedPlaceIdsRef = useRef<string[]>([]);
    const initialSessionRef = useRef<PlannerStoredSession | null | undefined>(undefined);

    if (initialSessionRef.current === undefined) {
        initialSessionRef.current = readStoredPlannerSession();
    }

    const initialSession = initialSessionRef.current;
    const initialForm = normalizeFormState(initialSession?.form);
    const initialLiveData = initialSession?.liveData || viewDataFromConversation(initialSession?.conversation);
    const initialDisplayData = initialSession?.displayData || initialLiveData;

    const [userId] = useState(() => {
        const configuredUserId = process.env.REACT_APP_DEV_USER_ID || DEFAULT_DEV_USER_ID;
        const savedUserId = initialSession?.userId || localStorage.getItem("plannerUserId");
        if (savedUserId) return savedUserId;
        localStorage.setItem("plannerUserId", configuredUserId);
        return configuredUserId;
    });

    const [city, setCity] = useState(initialForm.city);
    const [travelStartDate, setTravelStartDate] = useState<Dayjs | null>(dateValue(initialForm.travelStartDate));
    const [travelEndDate, setTravelEndDate] = useState<Dayjs | null>(dateValue(initialForm.travelEndDate));
    const [peopleCount, setPeopleCount] = useState(initialForm.peopleCount);
    const [travelStyle, setTravelStyle] = useState(initialForm.travelStyle);
    const [budget, setBudget] = useState(initialForm.budget);
    const [accommodationPreference, setAccommodationPreference] = useState(initialForm.accommodationPreference);
    const [transportPreference, setTransportPreference] = useState(initialForm.transportPreference);
    const [mustVisitKeywords, setMustVisitKeywords] = useState(initialForm.mustVisitKeywords);
    const [avoidKeywords, setAvoidKeywords] = useState(initialForm.avoidKeywords);
    const [notes, setNotes] = useState(initialForm.notes);

    const [conversation, setConversation] = useState<PlannerConversationResponse | null>(initialSession?.conversation || null);
    const [socketStatus, setSocketStatus] = useState<SocketStatus>("idle");
    const [creating, setCreating] = useState(false);
    const [hydrating, setHydrating] = useState(Boolean(initialSession?.conversation));
    const [chatSending, setChatSending] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [chatInput, setChatInput] = useState(initialSession?.chatInput || "");
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialSession?.chatMessages || []);
    const [liveData, setLiveData] = useState<PlannerViewData>(initialLiveData);
    const [displayData, setDisplayData] = useState<PlannerViewData>(initialDisplayData);
    const [snapshots, setSnapshots] = useState<PlannerSnapshot[]>(sortSnapshots(initialSession?.snapshots || []));
    const [viewingSnapshotVersion, setViewingSnapshotVersion] = useState<SnapshotView>(initialSession?.viewingSnapshotVersion || "latest");

    const formState = useMemo<PlannerFormState>(() => ({
        city,
        travelStartDate: formatPlannerDate(travelStartDate),
        travelEndDate: formatPlannerDate(travelEndDate),
        peopleCount,
        travelStyle,
        budget,
        accommodationPreference,
        transportPreference,
        mustVisitKeywords,
        avoidKeywords,
        notes,
    }), [
        city,
        travelStartDate,
        travelEndDate,
        peopleCount,
        travelStyle,
        budget,
        accommodationPreference,
        transportPreference,
        mustVisitKeywords,
        avoidKeywords,
        notes,
    ]);

    const coreSlots = useMemo<PlannerCoreSlots>(() => ({
        city: city.trim(),
        travelStartDate: formatPlannerDate(travelStartDate),
        travelEndDate: formatPlannerDate(travelEndDate) || undefined,
        peopleCount,
        budget: budget.trim() || undefined,
        travelStyle: travelStyle.trim() || undefined,
        accommodationPreference: accommodationPreference.trim() || undefined,
        transportPreference: transportPreference.trim() || undefined,
        notes: notes.trim() || undefined,
        mustVisitKeywords: splitKeywords(mustVisitKeywords),
        avoidKeywords: splitKeywords(avoidKeywords),
    }), [
        city,
        travelStartDate,
        travelEndDate,
        peopleCount,
        budget,
        travelStyle,
        accommodationPreference,
        transportPreference,
        notes,
        mustVisitKeywords,
        avoidKeywords,
    ]);

    const canStartPlanning = Boolean(coreSlots.city && coreSlots.travelStartDate && coreSlots.peopleCount > 0);
    const isSnapshotPreview = viewingSnapshotVersion !== "latest";
    const snapshotSelectorValue = viewingSnapshotVersion === "latest" ? "latest" : String(viewingSnapshotVersion);
    const snapshotCountLabel = snapshots.length > 0 ? `${snapshots.length} 个版本` : "暂无快照";

    useEffect(() => {
        viewingSnapshotVersionRef.current = viewingSnapshotVersion;
    }, [viewingSnapshotVersion]);

    useEffect(() => {
        selectedPlaceIdsRef.current = liveData.selectedPlaceIds;
    }, [liveData.selectedPlaceIds]);

    useEffect(() => {
        const session: PlannerStoredSession = {
            userId,
            form: formState,
            conversation,
            chatMessages,
            chatInput,
            liveData,
            displayData,
            snapshots,
            viewingSnapshotVersion,
        };
        localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(session));
    }, [
        userId,
        formState,
        conversation,
        chatMessages,
        chatInput,
        liveData,
        displayData,
        snapshots,
        viewingSnapshotVersion,
    ]);

    const applyCoreSlotsToForm = useCallback((slots: PlannerCoreSlots) => {
        const nextForm = formFromCoreSlots(slots);
        setCity(nextForm.city);
        setTravelStartDate(dateValue(nextForm.travelStartDate));
        setTravelEndDate(dateValue(nextForm.travelEndDate));
        setPeopleCount(nextForm.peopleCount);
        setTravelStyle(nextForm.travelStyle);
        setBudget(nextForm.budget);
        setAccommodationPreference(nextForm.accommodationPreference);
        setTransportPreference(nextForm.transportPreference);
        setMustVisitKeywords(nextForm.mustVisitKeywords);
        setAvoidKeywords(nextForm.avoidKeywords);
        setNotes(nextForm.notes);
    }, []);

    const setSnapshotView = useCallback((nextView: SnapshotView) => {
        viewingSnapshotVersionRef.current = nextView;
        setViewingSnapshotVersion(nextView);
    }, []);

    const applyLiveData = useCallback((nextData: PlannerViewData) => {
        setLiveData(nextData);
        if (viewingSnapshotVersionRef.current === "latest") {
            setDisplayData(nextData);
        }
    }, []);

    const refreshSnapshotList = useCallback(async (conversationId: string) => {
        try {
            const response = await ApiRequests.listPlannerSnapshots(conversationId, userId);
            setSnapshots(sortSnapshots(response.data));
        } catch (error) {
            console.error(error);
        }
    }, [userId]);

    const refreshConversationFromServer = useCallback(async (conversationId: string) => {
        setHydrating(true);
        try {
            const [conversationResponse, snapshotsResponse] = await Promise.all([
                ApiRequests.getPlannerConversation(conversationId, userId),
                ApiRequests.listPlannerSnapshots(conversationId, userId),
            ]);

            const nextConversation = conversationResponse.data;
            const nextSnapshots = sortSnapshots(snapshotsResponse.data);
            const latestSnapshot = nextSnapshots[0];
            const nextLiveData = latestSnapshot
                ? viewDataFromSnapshot(latestSnapshot)
                : viewDataFromConversation(nextConversation);
            const currentView = viewingSnapshotVersionRef.current;

            setConversation(nextConversation);
            applyCoreSlotsToForm(nextConversation.coreSlots);
            setSnapshots(nextSnapshots);
            setLiveData(nextLiveData);

            if (currentView === "latest") {
                setDisplayData(nextLiveData);
            } else {
                const historicalSnapshot = nextSnapshots.find(snapshot => snapshot.version === currentView);
                if (historicalSnapshot) {
                    setDisplayData(viewDataFromSnapshot(historicalSnapshot));
                } else {
                    setSnapshotView("latest");
                    setDisplayData(nextLiveData);
                }
            }
        } catch (error) {
            console.error(error);
            setErrorMessage("恢复 AI 规划会话失败，已保留本地缓存内容。请确认网关和 ai-arrange-service 可访问。");
        } finally {
            setHydrating(false);
        }
    }, [applyCoreSlotsToForm, setSnapshotView, userId]);

    useEffect(() => {
        if (conversation?.id) {
            void refreshConversationFromServer(conversation.id);
        } else {
            setHydrating(false);
        }
    }, [conversation?.id, refreshConversationFromServer]);

    const appendAssistantDelta = useCallback((payload: PlannerChatStreamPayload) => {
        setChatSending(!payload.done);
        setChatMessages(prevMessages => {
            let assistantMessageId = activeAssistantMessageIdRef.current;
            if (!assistantMessageId) {
                assistantMessageId = uuidv4();
                activeAssistantMessageIdRef.current = assistantMessageId;
                return [
                    ...prevMessages,
                    {
                        id: assistantMessageId,
                        role: "assistant",
                        text: payload.delta || "",
                        streaming: !payload.done,
                    },
                ];
            }

            return prevMessages.map(message => message.id === assistantMessageId
                ? {...message, text: `${message.text}${payload.delta || ""}`, streaming: !payload.done}
                : message);
        });

        if (payload.done) {
            activeAssistantMessageIdRef.current = null;
        }
    }, []);

    const sendPlannerEnvelope = useCallback((socket: WebSocket, conversationId: string, type: string, payload: unknown) => {
        socket.send(JSON.stringify({
            type,
            conversationId,
            userId,
            payload,
        }));
    }, [userId]);

    useEffect(() => {
        if (!conversation?.id) return;

        let closedByCleanup = false;
        const conversationId = conversation.id;
        const socket = new WebSocket(buildPlannerWebSocketUrl(conversationId, userId));

        plannerWSRef.current?.close();
        plannerWSRef.current = socket;
        setSocketStatus("connecting");

        socket.onopen = () => {
            if (closedByCleanup) return;

            setSocketStatus("connected");
            const seed = pendingInitialPromptRef.current?.conversationId === conversationId
                ? pendingInitialPromptRef.current
                : null;

            setChatMessages(prevMessages => [
                ...prevMessages,
                {
                    id: uuidv4(),
                    role: "system",
                    text: seed ? "已连接规划服务，AI 正在生成第一版行程。" : "已恢复规划服务连接，可以继续对话。",
                }
            ]);

            if (seed) {
                pendingInitialPromptRef.current = null;
                sendPlannerEnvelope(socket, conversationId, "PLANNER_CHAT_SEND", {
                    message: seed.prompt,
                    selectedPlaceIds: selectedPlaceIdsRef.current,
                });
                setChatSending(true);
            }
        };

        socket.onmessage = (event: MessageEvent<string>) => {
            const envelope = JSON.parse(event.data) as PlannerSocketEnvelope;

            if (envelope.type === "PLANNER_CHAT_STREAM") {
                appendAssistantDelta(envelope.payload as PlannerChatStreamPayload);
                return;
            }

            if (envelope.type === "PLANNER_DATA_REFRESH") {
                const payload = envelope.payload as PlannerDataRefreshPayload;
                applyLiveData(viewDataFromRefresh(payload));
                setChatSending(false);
                void refreshSnapshotList(conversationId);
                return;
            }

            if (envelope.type === "PLANNER_ERROR") {
                const payload = envelope.payload as {message?: string, code?: string};
                setErrorMessage(payload.message || payload.code || "规划服务返回错误");
                setChatSending(false);
            }
        };

        socket.onerror = () => {
            if (closedByCleanup) return;
            setSocketStatus("error");
            setErrorMessage("WebSocket 连接失败，请确认 api-gateway 和 ai-arrange-service 已启动。");
            setChatSending(false);
        };

        socket.onclose = () => {
            if (closedByCleanup) return;
            setSocketStatus(prevStatus => prevStatus === "error" ? "error" : "closed");
            setChatSending(false);
        };

        return () => {
            closedByCleanup = true;
            socket.close();
            if (plannerWSRef.current === socket) {
                plannerWSRef.current = null;
            }
        };
    }, [
        appendAssistantDelta,
        applyLiveData,
        conversation?.id,
        refreshSnapshotList,
        sendPlannerEnvelope,
        userId,
    ]);

    const handleStartPlanning = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setErrorMessage("");

        if (!canStartPlanning) {
            setErrorMessage("请先填写旅游城市、出行日期和人数。");
            return;
        }

        const payload: CreatePlannerConversationPayload = {
            userId,
            coreSlots,
        };

        setCreating(true);
        try {
            const response = await ApiRequests.createPlannerConversation(payload);
            const nextConversation = response.data;
            const nextData = viewDataFromConversation(nextConversation);

            pendingInitialPromptRef.current = {
                conversationId: nextConversation.id,
                prompt: buildInitialPrompt(coreSlots),
            };
            setConversation(nextConversation);
            setLiveData(nextData);
            setDisplayData(nextData);
            setSnapshots([]);
            setSnapshotView("latest");
            setChatMessages([]);
            setChatInput("");
        } catch (error) {
            console.error(error);
            setErrorMessage("创建 AI 规划会话失败，请确认网关 /ai-arrange/api/conversations 可访问。");
        } finally {
            setCreating(false);
        }
    };

    const handleSendChat = () => {
        const trimmedInput = chatInput.trim();
        if (!trimmedInput || !conversation) return;

        if (isSnapshotPreview) {
            setErrorMessage("当前正在回看历史快照。请先切回最新版本后继续对话。");
            return;
        }

        const socket = plannerWSRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            setErrorMessage("规划 WebSocket 未连接，无法发送消息。");
            return;
        }

        setChatMessages(prevMessages => [
            ...prevMessages,
            {id: uuidv4(), role: "user", text: trimmedInput}
        ]);
        setChatInput("");
        setErrorMessage("");
        sendPlannerEnvelope(socket, conversation.id, "PLANNER_CHAT_SEND", {
            message: trimmedInput,
            selectedPlaceIds: liveData.selectedPlaceIds,
        });
        setChatSending(true);
    };

    const togglePlaceSelection = (placeId: string) => {
        if (!conversation) return;

        if (isSnapshotPreview) {
            setErrorMessage("历史快照为只读回看。请切回最新版本后再调整点位。");
            return;
        }

        const nextSelectedPlaceIds = liveData.selectedPlaceIds.includes(placeId)
            ? liveData.selectedPlaceIds.filter(selectedPlaceId => selectedPlaceId !== placeId)
            : [...liveData.selectedPlaceIds, placeId];

        const nextData = {
            ...liveData,
            selectedPlaceIds: nextSelectedPlaceIds,
            places: liveData.places.map(place => ({
                ...place,
                selected: nextSelectedPlaceIds.includes(place.placeId),
            })),
        };

        applyLiveData(nextData);

        const socket = plannerWSRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
            sendPlannerEnvelope(socket, conversation.id, "PLANNER_PLACE_SELECTION", {
                selectedPlaceIds: nextSelectedPlaceIds,
            });
        }
    };

    const handleSnapshotChange = (value: string) => {
        if (value === "latest") {
            setSnapshotView("latest");
            setDisplayData(liveData);
            return;
        }

        const version = Number(value);
        const snapshot = snapshots.find(item => item.version === version);
        if (!snapshot) return;

        setSnapshotView(version);
        setDisplayData(viewDataFromSnapshot(snapshot));
    };

    const handleMarkdownChange = (nextMarkdown: string) => {
        if (isSnapshotPreview) return;
        const nextData = {...liveData, markdown: nextMarkdown};
        applyLiveData(nextData);
    };

    const resetPlanner = () => {
        plannerWSRef.current?.close();
        pendingInitialPromptRef.current = null;
        localStorage.removeItem(PLANNER_STORAGE_KEY);

        const nextForm = defaultPlannerForm();
        const nextData = emptyPlannerView();

        setConversation(null);
        setSocketStatus("idle");
        setCreating(false);
        setHydrating(false);
        setChatSending(false);
        setErrorMessage("");
        setChatInput("");
        setChatMessages([]);
        setLiveData(nextData);
        setDisplayData(nextData);
        setSnapshots([]);
        setSnapshotView("latest");

        setCity(nextForm.city);
        setTravelStartDate(dateValue(nextForm.travelStartDate));
        setTravelEndDate(dateValue(nextForm.travelEndDate));
        setPeopleCount(nextForm.peopleCount);
        setTravelStyle(nextForm.travelStyle);
        setBudget(nextForm.budget);
        setAccommodationPreference(nextForm.accommodationPreference);
        setTransportPreference(nextForm.transportPreference);
        setMustVisitKeywords(nextForm.mustVisitKeywords);
        setAvoidKeywords(nextForm.avoidKeywords);
        setNotes(nextForm.notes);
    };

    const navigateToInternalOffer = (place: PlannerPlaceSuggestion) => {
        if (!place.internalOfferId) return;
        navigate("/offerDetails", {
            state: {
                idHotel: place.internalOfferId,
                hotelName: place.name,
            },
        });
    };

    const renderTripBar = () => (
        <div className="grid shrink-0 gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 md:grid-cols-3">
            <div className="flex items-center gap-2 text-gray-700">
                <LocationOn style={{fontSize: 20, color: "#556cd6"}}/>
                <span>{coreSlots.city}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
                <CalendarMonth style={{fontSize: 20, color: "#556cd6"}}/>
                <span>{coreSlots.travelStartDate}{coreSlots.travelEndDate ? ` 至 ${coreSlots.travelEndDate}` : ""}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
                <Group style={{fontSize: 20, color: "#556cd6"}}/>
                <span>{coreSlots.peopleCount} 人</span>
            </div>
        </div>
    );

    const renderSlotForm = () => (
        <form className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white" onSubmit={handleStartPlanning}>
            <div className="shrink-0 border-b border-gray-200 px-5 py-4">
                <Typography variant="h6">出行基础信息</Typography>
                <Typography variant="body2" color="text.secondary">
                    城市、日期、人数是必填项，其它信息会作为 AI 生成规划的偏好约束。
                </Typography>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="grid gap-4">
                    <TextField
                        label="旅游城市"
                        value={city}
                        required
                        fullWidth
                        onChange={event => setCity(event.target.value)}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                        <DatePicker
                            label="出发日期"
                            value={travelStartDate}
                            onChange={value => setTravelStartDate(value)}
                            slotProps={{textField: {required: true, fullWidth: true}}}
                        />
                        <DatePicker
                            label="结束日期"
                            value={travelEndDate}
                            onChange={value => setTravelEndDate(value)}
                            slotProps={{textField: {fullWidth: true}}}
                        />
                    </div>

                    <TextField
                        label="人数"
                        value={peopleCount}
                        required
                        fullWidth
                        type="number"
                        inputProps={{min: 1}}
                        onChange={event => setPeopleCount(Math.max(1, Number(event.target.value) || 1))}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                        <TextField
                            label="旅行偏好"
                            value={travelStyle}
                            fullWidth
                            onChange={event => setTravelStyle(event.target.value)}
                        />
                        <TextField
                            label="预算"
                            value={budget}
                            fullWidth
                            placeholder="例如：人均 3000"
                            onChange={event => setBudget(event.target.value)}
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <TextField
                            label="住宿偏好"
                            value={accommodationPreference}
                            fullWidth
                            placeholder="例如：地铁附近、亲子酒店"
                            onChange={event => setAccommodationPreference(event.target.value)}
                        />
                        <TextField
                            label="交通偏好"
                            value={transportPreference}
                            fullWidth
                            placeholder="例如：少打车、公共交通优先"
                            onChange={event => setTransportPreference(event.target.value)}
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <TextField
                            label="想去的地点/关键词"
                            value={mustVisitKeywords}
                            fullWidth
                            placeholder="外滩、博物馆、咖啡"
                            onChange={event => setMustVisitKeywords(event.target.value)}
                        />
                        <TextField
                            label="需要避开的内容"
                            value={avoidKeywords}
                            fullWidth
                            placeholder="夜市、排队过久"
                            onChange={event => setAvoidKeywords(event.target.value)}
                        />
                    </div>

                    <TextField
                        label="补充说明"
                        value={notes}
                        fullWidth
                        minRows={3}
                        multiline
                        onChange={event => setNotes(event.target.value)}
                    />
                </div>
            </div>

            <div className="shrink-0 border-t border-gray-200 px-5 py-4">
                <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={!canStartPlanning || creating}
                    startIcon={<TravelExplore/>}
                    fullWidth
                >
                    开始规划
                </Button>
            </div>
        </form>
    );

    const renderMarkdownPanel = () => (
        <section className="flex min-h-0 flex-[1.15] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
                <div className="flex items-center gap-2">
                    <EditNote style={{color: "#556cd6"}}/>
                    <div>
                        <Typography variant="h6">规划 Markdown</Typography>
                        <Typography variant="caption" color="text.secondary">
                            {displayData.snapshotVersion ? `当前显示 v${displayData.snapshotVersion}` : "等待 AI 生成"}
                        </Typography>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Chip size="small" variant="outlined" icon={<History/>} label={snapshotCountLabel}/>
                    <TextField
                        select
                        size="small"
                        label="版本"
                        value={snapshotSelectorValue}
                        onChange={event => handleSnapshotChange(event.target.value)}
                        sx={{minWidth: 150}}
                    >
                        <MenuItem value="latest">最新版本</MenuItem>
                        {snapshots.map(snapshot => (
                            <MenuItem key={snapshot.id} value={String(snapshot.version)}>
                                v{snapshot.version} · {dayjs(snapshot.createdAt).isValid() ? dayjs(snapshot.createdAt).format("MM-DD HH:mm") : "历史快照"}
                            </MenuItem>
                        ))}
                    </TextField>
                    <Tooltip title="重新填写槽位">
                        <IconButton onClick={resetPlanner}>
                            <RestartAlt/>
                        </IconButton>
                    </Tooltip>
                </div>
            </div>

            {isSnapshotPreview &&
                <Alert severity="info" className="mx-4 mt-3" action={
                    <Button color="inherit" size="small" onClick={() => handleSnapshotChange("latest")}>
                        回到最新
                    </Button>
                }>
                    正在只读回看历史快照。切回最新版本后才能继续对话和调整点位。
                </Alert>
            }

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {displayData.summary &&
                    <Typography variant="body2" color="text.secondary" className="mb-3">{displayData.summary}</Typography>
                }

                <TextField
                    value={displayData.markdown}
                    onChange={event => handleMarkdownChange(event.target.value)}
                    placeholder="AI 生成的 Markdown 规划会显示在这里。"
                    multiline
                    minRows={12}
                    maxRows={12}
                    fullWidth
                    InputProps={{readOnly: isSnapshotPreview}}
                    sx={{
                        "& textarea": {
                            fontFamily: "Consolas, Menlo, Monaco, monospace",
                            fontSize: 14,
                            lineHeight: 1.7,
                        },
                        "& fieldset": {
                            borderRadius: 1,
                        }
                    }}
                />
            </div>
        </section>
    );

    const renderChatPanel = () => (
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
                <Typography variant="h6">对话协作</Typography>
                {chatSending && <Chip size="small" label="AI 生成中" color="primary" variant="outlined"/>}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {chatMessages.length === 0 &&
                    <Typography variant="body2" color="text.secondary">开始规划后，AI 的追问、建议和流式回复会显示在这里。</Typography>
                }

                {chatMessages.map(message => (
                    <div key={message.id} className={`mb-3 flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                            className={`max-w-[82%] rounded-lg px-4 py-3 text-sm leading-6 ${
                                message.role === "user"
                                    ? "bg-[#556cd6] text-white"
                                    : message.role === "system"
                                        ? "bg-gray-100 text-gray-600"
                                        : "bg-[#f4f6fb] text-gray-800"
                            }`}
                        >
                            <pre className="whitespace-pre-wrap font-sans">{message.text}{message.streaming ? "|" : ""}</pre>
                        </div>
                    </div>
                ))}
            </div>

            <div className="shrink-0 border-t border-gray-200 p-3">
                <div className="flex gap-2">
                    <TextField
                        value={chatInput}
                        onChange={event => setChatInput(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                handleSendChat();
                            }
                        }}
                        fullWidth
                        multiline
                        maxRows={3}
                        disabled={!conversation || isSnapshotPreview}
                        placeholder={isSnapshotPreview ? "历史快照只读，请切回最新版本后继续对话。" : "继续告诉 AI：想加一个亲子景点、减少换乘、调整酒店区域..."}
                    />
                    <Button
                        variant="contained"
                        onClick={handleSendChat}
                        disabled={!chatInput.trim() || socketStatus !== "connected" || isSnapshotPreview}
                        startIcon={<Send/>}
                    >
                        发送
                    </Button>
                </div>
            </div>
        </section>
    );

    const renderRecommendationsPanel = () => (
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
                <Typography variant="h6">AI 推荐选项</Typography>
                <Chip size="small" label={`已选 ${displayData.selectedPlaceIds.length}`} color="secondary" variant="outlined"/>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {displayData.places.length === 0 &&
                    <Typography variant="body2" color="text.secondary">等待 AI 返回景点、餐厅、酒店等候选项。</Typography>
                }

                <div className="flex flex-col gap-3">
                    {displayData.places.map((place, index) => {
                        const selected = displayData.selectedPlaceIds.includes(place.placeId);
                        return (
                            <Paper key={place.placeId} elevation={0} className="border border-gray-200 p-4">
                                <div className="mb-2 flex items-start justify-between gap-3">
                                    <div>
                                        <Typography variant="subtitle1">{index + 1}. {place.name}</Typography>
                                        <Typography variant="caption" color="text.secondary">{place.address || "等待地图地址补全"}</Typography>
                                    </div>
                                    {selected
                                        ? <CheckCircle style={{color: "#19857b"}}/>
                                        : <LocationOn style={{color: "#556cd6"}}/>
                                    }
                                </div>

                                {place.description &&
                                    <Typography variant="body2" className="mb-3 text-gray-700">{place.description}</Typography>
                                }

                                <div className="mb-3 flex flex-wrap gap-1">
                                    <Chip size="small" label={placeTypeToLabel(place.type)}/>
                                    <Chip size="small" label={sourceToLabel(place.source)} variant="outlined"/>
                                    {place.tags?.slice(0, 3).map(tag => <Chip key={tag} size="small" label={tag} variant="outlined"/>)}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        size="small"
                                        variant={selected ? "contained" : "outlined"}
                                        startIcon={selected ? <Close/> : <BookmarkAdd/>}
                                        disabled={isSnapshotPreview}
                                        onClick={() => togglePlaceSelection(place.placeId)}
                                    >
                                        {selected ? "取消选择" : "加入计划"}
                                    </Button>
                                    {place.internalOfferId &&
                                        <Button
                                            size="small"
                                            variant="text"
                                            startIcon={<Hotel/>}
                                            onClick={() => navigateToInternalOffer(place)}
                                        >
                                            去预订
                                        </Button>
                                    }
                                </div>
                            </Paper>
                        );
                    })}
                </div>
            </div>
        </section>
    );

    return (
        <div className="h-[calc(100dvh-88px)] overflow-hidden bg-[#f6f7fb]">
            <div className="flex h-full flex-col gap-3 p-4">
                <section className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-5 py-4">
                    <div className="flex items-center gap-3">
                        <AutoAwesome style={{color: "#556cd6"}}/>
                        <div>
                            <Typography variant="h5">{displayData.title}</Typography>
                            <Typography variant="body2" color="text.secondary">
                                {conversation ? `会话 ${conversation.id.slice(0, 8)} · 用户 ${userId.slice(0, 8)}` : "固定槽位收集完成后进入自由规划"}
                            </Typography>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {displayData.snapshotVersion &&
                            <Chip size="small" color="secondary" variant="outlined" label={`v${displayData.snapshotVersion}`}/>
                        }
                        <Chip
                            size="small"
                            color={socketStatus === "connected" ? "success" : socketStatus === "error" ? "error" : "default"}
                            label={conversation ? socketStatus : "未开始"}
                        />
                    </div>
                </section>

                {(creating || chatSending || hydrating) &&
                    <Box sx={{height: 4}}>
                        <LinearProgress/>
                    </Box>
                }

                {errorMessage &&
                    <Alert severity="error" className="shrink-0" onClose={() => setErrorMessage("")}>{errorMessage}</Alert>
                }

                <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
                    <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
                        {!conversation && renderSlotForm()}

                        {conversation &&
                            <>
                                {renderTripBar()}
                                <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1.15fr)_minmax(260px,0.85fr)] gap-4">
                                    {renderMarkdownPanel()}
                                    {renderChatPanel()}
                                </div>
                            </>
                        }
                    </div>

                    <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
                        <PlannerMapPanel
                            places={displayData.places}
                            routes={displayData.routes}
                            selectedPlaceIds={displayData.selectedPlaceIds}
                            readOnly={isSnapshotPreview}
                            onTogglePlace={togglePlaceSelection}
                        />
                        {renderRecommendationsPanel()}
                    </div>
                </div>
            </div>
        </div>
    );
}
