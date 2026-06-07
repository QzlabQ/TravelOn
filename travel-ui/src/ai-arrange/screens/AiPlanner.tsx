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
    ErrorOutline,
    Group,
    History,
    HourglassTop,
    Hotel,
    LocationOn,
    Map as MapIcon,
    RestartAlt,
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
    PlannerErrorPayload,
    PlannerModelVariant,
    PlannerPlaceSuggestion,
    PlannerRouteSegment,
    PlannerTraceEvent,
    PlannerSnapshot,
    PlannerSocketEnvelope
} from "../../core/apiConfig";
import {PlannerMapPanel} from "../components/PlannerMapPanel";
import {buildMockPlannerViewData} from "../mockPlannerData";

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
    modelVariant: PlannerModelVariant,
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
    plannerTraceEvents: PlannerTraceEvent[],
    viewingSnapshotVersion: SnapshotView,
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
        modelVariant: "FLASH",
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
    const modelVariant: PlannerModelVariant = value?.modelVariant === "PRO" ? "PRO" : "FLASH";
    return {
        ...defaults,
        ...value,
        modelVariant,
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

function formatPlannerError(payload: PlannerErrorPayload) {
    const lines = [
        payload.message || payload.code || "规划服务返回错误",
        payload.code ? `错误码：${payload.code}` : "",
        payload.detail ? `详情：${payload.detail}` : "",
    ].filter(Boolean);
    return lines.join("\n");
}

function sortSnapshots(snapshots: PlannerSnapshot[]) {
    return [...snapshots].sort((left, right) => (right.version || 0) - (left.version || 0));
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

function traceToolLabel(tool?: string) {
    if (tool === "agent") return "整理偏好";
    if (tool === "search_hotels") return "酒店";
    if (tool === "get_weather") return "天气";
    if (tool === "search_flights") return "交通";
    if (tool === "estimate_budget") return "预算";
    if (tool === "amap_route_plan") return "路线";
    if (tool === "deepseek_chat_completion") return "模型";
    if (tool === "fallback_plan_builder") return "兜底";
    return tool || "规划";
}

function traceStatusLabel(status?: string) {
    if (status === "RUNNING") return "进行中";
    if (status === "READY") return "已准备";
    if (status === "SUCCESS") return "完成";
    if (status === "PARTIAL_SUCCESS") return "部分完成";
    if (status === "FAILED") return "失败";
    if (status === "SKIPPED") return "跳过";
    return status || "等待";
}

function traceStatusColor(status?: string): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" {
    if (status === "RUNNING" || status === "READY") return "primary";
    if (status === "SUCCESS") return "success";
    if (status === "PARTIAL_SUCCESS" || status === "SKIPPED") return "warning";
    if (status === "FAILED") return "error";
    return "default";
}

function traceMessage(event?: PlannerTraceEvent | null) {
    if (!event) return "等待规划任务开始";
    return event.message || `${traceToolLabel(event.tool)}${traceStatusLabel(event.status)}`;
}

function traceEventKey(event: PlannerTraceEvent, index: number) {
    return event.eventId || `${event.type}-${event.tool || "planner"}-${event.createdAt || index}`;
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
    const [modelVariant, setModelVariant] = useState<PlannerModelVariant>(initialForm.modelVariant);

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
    const [plannerTraceEvents, setPlannerTraceEvents] = useState<PlannerTraceEvent[]>(initialSession?.plannerTraceEvents || []);
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
        modelVariant,
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
        modelVariant,
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
    const progressEvents = useMemo(
        () => plannerTraceEvents.filter(event => event.type !== "RUN_FINISHED" || event.message),
        [plannerTraceEvents]
    );
    const currentTraceEvent = useMemo(() => {
        const activeEvent = [...progressEvents].reverse().find(event => event.status === "RUNNING" || event.status === "READY");
        return activeEvent || progressEvents[progressEvents.length - 1] || null;
    }, [progressEvents]);
    const recentTraceEvents = useMemo(() => progressEvents.slice(-5), [progressEvents]);
    const showPlannerProgress = chatSending || progressEvents.length > 0;

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
        plannerTraceEvents,
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
        plannerTraceEvents,
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
        setModelVariant(nextForm.modelVariant);
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
            setErrorMessage("恢复 AI 规划会话失败，已保留本地缓存内容。请确认 ai-arrange-service 可访问。");
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
                    modelVariant,
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

            if (envelope.type === "PLANNER_TRACE_EVENT") {
                const payload = envelope.payload as PlannerTraceEvent;
                setPlannerTraceEvents(prevEvents => [...prevEvents.slice(-11), payload]);
                if (payload.type === "RUN_FAILED") {
                    setChatSending(false);
                }
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
                const payload = envelope.payload as PlannerErrorPayload;
                setErrorMessage(formatPlannerError(payload));
                setChatSending(false);
            }
        };

        socket.onerror = () => {
            if (closedByCleanup) return;
            setSocketStatus("error");
            setErrorMessage("WebSocket 连接失败，请确认 ai-arrange-service 已启动。");
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
        modelVariant,
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
            setPlannerTraceEvents([]);
            setSnapshotView("latest");
            setChatMessages([]);
            setChatInput("");
        } catch (error) {
            console.error(error);
            setErrorMessage("创建 AI 规划会话失败，请确认 ai-arrange-service 的 /ai-arrange/api/conversations 可访问。");
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
        setPlannerTraceEvents([]);
        sendPlannerEnvelope(socket, conversation.id, "PLANNER_CHAT_SEND", {
            message: trimmedInput,
            selectedPlaceIds: liveData.selectedPlaceIds,
            modelVariant,
        });
        setChatSending(true);
    };

    const togglePlaceSelection = (placeId: string) => {
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

        if (!conversation) return;

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
        setPlannerTraceEvents([]);
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
        setModelVariant(nextForm.modelVariant);
    };

    const loadMockPlannerData = () => {
        plannerWSRef.current?.close();
        pendingInitialPromptRef.current = null;

        const nextData = {
            ...emptyPlannerView(),
            ...buildMockPlannerViewData(coreSlots.city || city || "上海"),
            snapshotVersion: null,
        };

        setConversation(null);
        setSocketStatus("idle");
        setCreating(false);
        setHydrating(false);
        setChatSending(false);
        setErrorMessage("");
        setChatInput("");
        setChatMessages([
            {
                id: uuidv4(),
                role: "system",
                text: "已载入模拟地图数据，可以先做前端联调。",
            }
        ]);
        setLiveData(nextData);
        setDisplayData(nextData);
        setSnapshots([]);
        setPlannerTraceEvents([]);
        setSnapshotView("latest");
    };

    const handleModelVariantChange = (value: string) => {
        setModelVariant(value === "FLASH" ? "FLASH" : "PRO");
    };

    const renderModelVariantSelect = (fullWidth = false) => (
        <TextField
            select
            label="模型模式"
            value={modelVariant}
            fullWidth={fullWidth}
            size={fullWidth ? "medium" : "small"}
            onChange={event => handleModelVariantChange(event.target.value)}
            sx={fullWidth ? undefined : {minWidth: 150}}
        >
            <MenuItem value="FLASH">Flash 快速</MenuItem>
            <MenuItem value="PRO">Pro 高质量</MenuItem>
        </TextField>
    );

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

                    <div className="grid gap-4 md:grid-cols-2">
                        <TextField
                            label="人数"
                            value={peopleCount}
                            required
                            fullWidth
                            type="number"
                            inputProps={{min: 1}}
                            onChange={event => setPeopleCount(Math.max(1, Number(event.target.value) || 1))}
                        />
                        {renderModelVariantSelect(true)}
                    </div>

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

            <div className="grid shrink-0 gap-3 border-t border-gray-200 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto]">
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
                <Button
                    type="button"
                    variant="outlined"
                    size="large"
                    startIcon={<MapIcon/>}
                    onClick={loadMockPlannerData}
                >
                    载入模拟数据
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

    const renderPlannerProgress = () => {
        if (!showPlannerProgress) return null;

        const activeStatus = currentTraceEvent?.status || (chatSending ? "RUNNING" : "SUCCESS");
        const activeLabel = traceMessage(currentTraceEvent) || (chatSending ? "正在等待规划引擎响应..." : "规划任务已结束。");

        return (
            <div className="shrink-0 border-b border-gray-200 bg-[#fbfcff] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2 text-gray-800">
                        {activeStatus === "FAILED"
                            ? <ErrorOutline style={{fontSize: 20, color: "#d32f2f"}}/>
                            : activeStatus === "SUCCESS"
                                ? <CheckCircle style={{fontSize: 20, color: "#2e7d32"}}/>
                                : <HourglassTop style={{fontSize: 20, color: "#556cd6"}}/>
                        }
                        <Typography variant="body2" className="truncate">
                            {activeLabel}
                        </Typography>
                    </div>
                    <Chip
                        size="small"
                        color={traceStatusColor(activeStatus)}
                        variant="outlined"
                        label={traceStatusLabel(activeStatus)}
                    />
                </div>

                {chatSending &&
                    <Box sx={{mt: 1.25}}>
                        <LinearProgress/>
                    </Box>
                }

                {recentTraceEvents.length > 0 &&
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {recentTraceEvents.map((event, index) => (
                            <Chip
                                key={traceEventKey(event, index)}
                                size="small"
                                variant="outlined"
                                color={traceStatusColor(event.status)}
                                label={`${traceToolLabel(event.tool)} · ${traceStatusLabel(event.status)}`}
                            />
                        ))}
                    </div>
                }
            </div>
        );
    };

    const renderChatPanel = () => (
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
                <Typography variant="h6">对话协作</Typography>
                {chatSending && <Chip size="small" label="AI 生成中" color="primary" variant="outlined"/>}
            </div>

            {renderPlannerProgress()}

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
                        {conversation && renderModelVariantSelect(false)}
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
                    <Alert
                        severity="error"
                        className="shrink-0"
                        onClose={() => setErrorMessage("")}
                        action={
                            <Button color="inherit" size="small" onClick={resetPlanner}>
                                新建对话
                            </Button>
                        }
                    >
                        <span className="whitespace-pre-wrap">{errorMessage}</span>
                    </Alert>
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
