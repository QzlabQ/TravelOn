import React, {FormEvent, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    Collapse,
    IconButton,
    LinearProgress,
    MenuItem,
    Paper,
    TextField,
    Tooltip,
    ToggleButton,
    ToggleButtonGroup,
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
    Code,
    EditNote,
    ExpandMore,
    Flight,
    Group,
    History,
    Hotel,
    LocationOn,
    Map as MapIcon,
    RestartAlt,
    Restore,
    Send,
    Save,
    Train,
    TravelExplore,
    Visibility
} from "@mui/icons-material";
import {
    ApiRequests,
    buildPlannerWebSocketUrl,
    CreatePlannerConversationPayload,
    PlannerChatSendPayload,
    PlannerChatStreamPayload,
    PlannerBookingLink,
    PlannerConversationResponse,
    PlannerCoreSlots,
    PlannerDataRefreshPayload,
    PlannerDayVersion,
    PlannerDayPlanRef,
    PlannerErrorPayload,
    PlannerModelVariant,
    PlannerPlaceSuggestion,
    PlannerRouteSegment,
    PlannerTraceEvent,
    PlannerSnapshot,
    PlannerSnapshotDiffResponse,
    PlannerSocketEnvelope,
    PlannerRunStatePayload,
    PlannerRunStatus
} from "../../core/apiConfig";
import {PlannerMapPanel} from "../components/PlannerMapPanel";
import {FloatingAiAssistant} from "../components/FloatingAiAssistant";
import {buildMockPlannerViewData} from "../mockPlannerData";
import MarkdownPreview from "../../core/components/MarkdownPreview";
import PostPublishDialog from "../../community/components/PostPublishDialog";
import {useAuthSession} from "../../core/useAuthSession";

type SocketStatus = "idle" | "connecting" | "connected" | "closed" | "error";
type SnapshotView = "latest" | number;
type PlannerMarkdownMode = "preview" | "edit";

interface ChatMessage {
    id: string,
    role: "user" | "assistant" | "system",
    text: string,
    streaming?: boolean,
}

interface PlannerFormState {
    departureCity: string,
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
    scope?: string,
    currentDayIndex: number | null,
    completedDayIndexes: number[],
    dayPlans: PlannerDayPlanRef[],
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
    liveData: PlannerViewData,
    displayData: PlannerViewData,
    snapshots: PlannerSnapshot[],
    plannerTraceEvents: PlannerTraceEvent[],
    viewingSnapshotVersion: SnapshotView,
    markdownMode?: PlannerMarkdownMode,
    targetDayIndex?: number,
    activeRunId?: string,
    activeRunStatus?: PlannerRunStatus,
}

const DEFAULT_DEV_USER_ID = "00000000-0000-0000-0000-000000000001";
const PLANNER_STORAGE_KEY = "travel-ui.ai-planner.session.v1";
const PLANNER_WS_RECONNECT_MESSAGE = "AI 连接已断开，正在自动重连。";
const CITY_QUICK_OPTIONS = ["北京", "上海", "广州", "深圳", "杭州", "南京", "成都", "重庆", "西安", "苏州", "厦门", "青岛", "长沙", "武汉", "天津"];
const PEOPLE_COUNT_QUICK_OPTIONS = ["1", "2", "3", "4", "5", "6"];
const TRAVEL_STYLE_QUICK_OPTIONS = [
    "轻松 citywalk + 经典地标",
    "亲子友好",
    "情侣慢旅行",
    "美食优先",
    "博物馆/展览",
    "自然风景",
    "夜景摄影",
    "低强度少步行",
];
const BUDGET_QUICK_OPTIONS = ["人均 1000 以内", "人均 1000-2000", "人均 2000-3000", "人均 3000-5000", "不限制预算"];
const ACCOMMODATION_QUICK_OPTIONS = ["地铁附近", "景区附近", "亲子酒店", "高性价比", "江景/海景", "安静舒适", "可步行到核心景点"];
const TRANSPORT_QUICK_OPTIONS = ["公共交通优先", "少换乘", "少步行", "打车优先", "高铁优先", "飞机优先", "自驾友好"];
const MUST_VISIT_QUICK_OPTIONS = ["地标建筑", "博物馆", "美食街", "咖啡店", "公园", "夜景", "历史街区", "亲子乐园", "购物中心"];
const AVOID_QUICK_OPTIONS = ["排队过久", "人流密集", "夜市", "爬山", "长距离步行", "过度商业化", "早起行程"];

function defaultPlannerForm(): PlannerFormState {
    return {
        departureCity: "北京",
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
        scope: undefined,
        currentDayIndex: null,
        completedDayIndexes: [],
        dayPlans: [],
        places: [],
        routes: [],
        selectedPlaceIds: [],
        snapshotVersion: null,
    };
}

function normalizePlannerViewData(value?: Partial<PlannerViewData> | null): PlannerViewData {
    const defaults = emptyPlannerView();
    return {
        ...defaults,
        ...value,
        title: typeof value?.title === "string" && value.title.trim() ? value.title : defaults.title,
        summary: typeof value?.summary === "string" ? value.summary : defaults.summary,
        markdown: typeof value?.markdown === "string" ? value.markdown : defaults.markdown,
        scope: typeof value?.scope === "string" ? value.scope : defaults.scope,
        currentDayIndex: typeof value?.currentDayIndex === "number" ? value.currentDayIndex : null,
        completedDayIndexes: Array.isArray(value?.completedDayIndexes)
            ? value.completedDayIndexes.filter((item): item is number => typeof item === "number")
            : [],
        dayPlans: Array.isArray(value?.dayPlans) ? value.dayPlans : [],
        places: Array.isArray(value?.places) ? value.places : [],
        routes: Array.isArray(value?.routes) ? value.routes : [],
        selectedPlaceIds: Array.isArray(value?.selectedPlaceIds)
            ? value.selectedPlaceIds.filter((item): item is string => typeof item === "string")
            : [],
        snapshotVersion: typeof value?.snapshotVersion === "number" ? value.snapshotVersion : null,
    };
}

function normalizeStoredPlannerSession(value?: Partial<PlannerStoredSession> | null): PlannerStoredSession | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const conversation = value.conversation || null;
    const baseViewData = viewDataFromConversation(conversation);
    const liveData = normalizePlannerViewData({
        ...baseViewData,
        ...(value.liveData || {}),
    });
    const displayData = normalizePlannerViewData({
        ...liveData,
        ...(value.displayData || {}),
    });

    return {
        userId: typeof value.userId === "string" && value.userId.trim() ? value.userId : DEFAULT_DEV_USER_ID,
        form: normalizeFormState(value.form),
        conversation,
        chatMessages: Array.isArray(value.chatMessages) ? value.chatMessages : [],
        liveData,
        displayData,
        snapshots: Array.isArray(value.snapshots) ? value.snapshots : [],
        plannerTraceEvents: Array.isArray(value.plannerTraceEvents) ? value.plannerTraceEvents : [],
        viewingSnapshotVersion: value.viewingSnapshotVersion === "latest" || typeof value.viewingSnapshotVersion === "number"
            ? value.viewingSnapshotVersion
            : "latest",
        markdownMode: value.markdownMode === "edit" ? "edit" : "preview",
        targetDayIndex: typeof value.targetDayIndex === "number" && value.targetDayIndex > 0 ? value.targetDayIndex : undefined,
        activeRunId: typeof value.activeRunId === "string" ? value.activeRunId : undefined,
        activeRunStatus: value.activeRunStatus === "RUNNING" || value.activeRunStatus === "SUCCEEDED" || value.activeRunStatus === "FAILED"
            ? value.activeRunStatus
            : undefined,
    };
}

function readStoredPlannerSession(): PlannerStoredSession | null {
    try {
        const raw = localStorage.getItem(PLANNER_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) as Partial<PlannerStoredSession> : null;
        return normalizeStoredPlannerSession(parsed);
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
        departureCity: slots.departureCity || "",
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
        scope: snapshot.scope,
        currentDayIndex: snapshot.currentDayIndex ?? null,
        completedDayIndexes: snapshot.completedDayIndexes || [],
        dayPlans: snapshot.dayPlans || [],
        places: snapshot.places || [],
        routes: snapshot.routes || [],
        selectedPlaceIds: snapshot.selectedPlaceIds || [],
        snapshotVersion: snapshot.version ?? null,
    };
}

function viewDataFromDayVersion(record: PlannerDayVersion, fallbackData: PlannerViewData): PlannerViewData {
    return {
        ...fallbackData,
        title: record.title || fallbackData.title,
        markdown: record.markdown || fallbackData.markdown,
        currentDayIndex: record.dayIndex || fallbackData.currentDayIndex,
        places: record.places || fallbackData.places,
        routes: record.routes || fallbackData.routes,
        selectedPlaceIds: record.selectedPlaceIds || fallbackData.selectedPlaceIds,
        snapshotVersion: record.sourceSnapshotVersion ?? fallbackData.snapshotVersion,
    };
}

function isTripMarkdownScope(scope?: string) {
    return scope === "TRIP_ASSEMBLE" || scope === "TRIP_MARKDOWN_EDIT";
}

function viewDataForDay(data: PlannerViewData, dayIndex: number): PlannerViewData {
    const normalizedData = normalizePlannerViewData(data);
    if (isTripMarkdownScope(normalizedData.scope)) {
        return normalizedData;
    }

    const dayPlans = Array.isArray(normalizedData.dayPlans) ? normalizedData.dayPlans : [];
    const dayPlan = dayPlans.find(record => record.dayIndex === dayIndex);
    if (!dayPlan) {
        return {
            ...normalizedData,
            currentDayIndex: dayIndex,
        };
    }

    return normalizePlannerViewData({
        ...normalizedData,
        title: dayPlan.title || normalizedData.title,
        markdown: dayPlan.markdown || normalizedData.markdown,
        currentDayIndex: dayIndex,
        places: dayPlan.places && dayPlan.places.length > 0 ? dayPlan.places : normalizedData.places,
        routes: dayPlan.routes && dayPlan.routes.length > 0 ? dayPlan.routes : normalizedData.routes,
        selectedPlaceIds: dayPlan.selectedPlaceIds && dayPlan.selectedPlaceIds.length > 0
            ? dayPlan.selectedPlaceIds
            : normalizedData.selectedPlaceIds,
    });
}

function viewDataFromRefresh(payload: PlannerDataRefreshPayload): PlannerViewData {
    return {
        title: payload.title || "行前智能规划",
        summary: payload.summary || "",
        markdown: payload.markdown || "",
        scope: payload.scope,
        currentDayIndex: payload.currentDayIndex ?? null,
        completedDayIndexes: payload.completedDayIndexes || [],
        dayPlans: payload.dayPlans || [],
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
    if (tool === "model_chat_completion" || tool === "deepseek_chat_completion") return "模型";
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

function dayPlanStatusColor(status?: string): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" {
    if (status === "CONFIRMED") return "success";
    if (status === "DRAFT") return "warning";
    if (status === "CURRENT") return "primary";
    return "default";
}

function dayPlanStatusLabel(status?: string) {
    if (status === "CONFIRMED") return "已确认";
    if (status === "DRAFT") return "草稿";
    if (status === "NEEDS_REVISION") return "待修改";
    return status || "草稿";
}

function diffTypeColor(type?: string): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" {
    if (type === "ADDED") return "success";
    if (type === "REMOVED") return "error";
    if (type === "CHANGED") return "warning";
    return "default";
}

function diffTypeLabel(type?: string) {
    if (type === "ADDED") return "新增";
    if (type === "REMOVED") return "移除";
    if (type === "CHANGED") return "变更";
    return type || "变化";
}

function buildInitialPrompt(slots: PlannerCoreSlots) {
    const dateRange = slots.travelEndDate ? `${slots.travelStartDate} 至 ${slots.travelEndDate}` : slots.travelStartDate;
    return [
        `请基于我的基础信息，先生成一版 ${slots.city} 行前智能规划。`,
        slots.departureCity ? `出发城市：${slots.departureCity}` : "",
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
    const session = useAuthSession();
    const plannerWSRef = useRef<WebSocket | null>(null);
    const activeAssistantMessageIdRef = useRef<string | null>(null);
    const pendingInitialPromptRef = useRef<{conversationId: string, prompt: string, runId: string} | null>(null);
    const viewingSnapshotVersionRef = useRef<SnapshotView>("latest");
    const selectedPlaceIdsRef = useRef<string[]>([]);
    const activeRunIdRef = useRef<string | null>(null);
    const activeRunStatusRef = useRef<PlannerRunStatus | null>(null);
    const activeDayIndexRef = useRef(1);
    const plannerRunInFlightRef = useRef(false);
    const lastPlannerRunCompletedRef = useRef(false);
    const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wsReconnectAttemptsRef = useRef(0);
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

    const [departureCity, setDepartureCity] = useState(initialForm.departureCity);
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
    const [wsReconnectNonce, setWsReconnectNonce] = useState(0);
    const [creating, setCreating] = useState(false);
    const [hydrating, setHydrating] = useState(Boolean(initialSession?.conversation));
    const [chatSending, setChatSending] = useState(false);
    const [activeRunId, setActiveRunId] = useState<string | null>(
        initialSession?.activeRunId || initialSession?.conversation?.activeRun?.runId || null
    );
    const [activeRunStatus, setActiveRunStatus] = useState<PlannerRunStatus | null>(
        initialSession?.activeRunStatus || initialSession?.conversation?.activeRun?.status || null
    );
    const [errorMessage, setErrorMessage] = useState("");
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialSession?.chatMessages || []);
    const [liveData, setLiveData] = useState<PlannerViewData>(initialLiveData);
    const [displayData, setDisplayData] = useState<PlannerViewData>(initialDisplayData);
    const [snapshots, setSnapshots] = useState<PlannerSnapshot[]>(sortSnapshots(initialSession?.snapshots || []));
    const [plannerTraceEvents, setPlannerTraceEvents] = useState<PlannerTraceEvent[]>(initialSession?.plannerTraceEvents || []);
    const [viewingSnapshotVersion, setViewingSnapshotVersion] = useState<SnapshotView>(initialSession?.viewingSnapshotVersion || "latest");
    const [markdownMode, setMarkdownMode] = useState<PlannerMarkdownMode>(initialSession?.markdownMode || "preview");
    const [markdownDraft, setMarkdownDraft] = useState(initialDisplayData.markdown || "");
    const [markdownDraftBaseVersion, setMarkdownDraftBaseVersion] = useState<number | null>(initialDisplayData.snapshotVersion);
    const [markdownDirty, setMarkdownDirty] = useState(false);
    const [markdownSaving, setMarkdownSaving] = useState(false);
    const [snapshotDiff, setSnapshotDiff] = useState<PlannerSnapshotDiffResponse | null>(null);
    const [snapshotDiffLoading, setSnapshotDiffLoading] = useState(false);
    const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
    const [dayVersions, setDayVersions] = useState<PlannerDayVersion[]>([]);
    const [dayVersionsLoading, setDayVersionsLoading] = useState(false);
    const [assemblingTrip, setAssemblingTrip] = useState(false);
    const [communityPublishOpen, setCommunityPublishOpen] = useState(false);
    const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
    const [showRecommendations, setShowRecommendations] = useState(false);
    const [targetDayIndex, setTargetDayIndex] = useState(
        initialSession?.targetDayIndex
        || initialDisplayData.currentDayIndex
        || initialLiveData.currentDayIndex
        || 1
    );

    useEffect(() => {
        activeRunIdRef.current = activeRunId;
        activeRunStatusRef.current = activeRunStatus;
    }, [activeRunId, activeRunStatus]);

    const formState = useMemo<PlannerFormState>(() => ({
        departureCity,
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
        departureCity,
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
        departureCity: departureCity.trim() || undefined,
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
        departureCity,
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
    const progressEvents = useMemo(
        () => plannerTraceEvents.filter(event => event.type !== "RUN_FINISHED" || event.message),
        [plannerTraceEvents]
    );
    const currentTraceEvent = useMemo(() => {
        const activeEvent = [...progressEvents].reverse().find(event => event.status === "RUNNING" || event.status === "READY");
        return activeEvent || progressEvents[progressEvents.length - 1] || null;
    }, [progressEvents]);
    const recentTraceEvents = useMemo(() => progressEvents.slice(-5), [progressEvents]);
    const displayedDayPlans = displayData.dayPlans || [];
    const completedDaySet = useMemo(() => new Set(displayData.completedDayIndexes || []), [displayData.completedDayIndexes]);
    const tripDayCount = useMemo(() => {
        const start = dayjs(coreSlots.travelStartDate);
        const end = coreSlots.travelEndDate ? dayjs(coreSlots.travelEndDate) : start;
        if (!start.isValid() || !end.isValid()) return Math.max(1, displayedDayPlans.length || 1);
        return Math.max(1, end.diff(start, "day") + 1);
    }, [coreSlots.travelEndDate, coreSlots.travelStartDate, displayedDayPlans.length]);
    const displayedDayPlanByIndex = useMemo(
        () => new Map(displayedDayPlans.map(dayPlan => [dayPlan.dayIndex || 0, dayPlan])),
        [displayedDayPlans]
    );
    const suggestedDayIndex = useMemo(() => {
        const currentDayIndex = displayData.currentDayIndex;
        const currentDayPlan = currentDayIndex ? displayedDayPlanByIndex.get(currentDayIndex) : undefined;
        const currentDayConfirmed = currentDayIndex
            ? completedDaySet.has(currentDayIndex) || currentDayPlan?.status === "CONFIRMED"
            : false;

        if (currentDayIndex && currentDayPlan && !currentDayConfirmed) {
            return currentDayIndex;
        }

        for (let dayIndex = 1; dayIndex <= tripDayCount; dayIndex += 1) {
            const dayPlan = displayedDayPlanByIndex.get(dayIndex);
            const dayConfirmed = completedDaySet.has(dayIndex) || dayPlan?.status === "CONFIRMED";
            if (!dayPlan || !dayConfirmed) {
                return dayIndex;
            }
        }

        return currentDayIndex || displayedDayPlans[0]?.dayIndex || 1;
    }, [completedDaySet, displayData.currentDayIndex, displayedDayPlanByIndex, displayedDayPlans, tripDayCount]);
    const dayOptions = useMemo(() => {
        const indexes = new Set<number>();
        for (let dayIndex = 1; dayIndex <= tripDayCount; dayIndex += 1) {
            indexes.add(dayIndex);
        }
        displayedDayPlans.forEach(dayPlan => {
            if (dayPlan.dayIndex) indexes.add(dayPlan.dayIndex);
        });
        indexes.add(suggestedDayIndex);
        return Array.from(indexes).filter(dayIndex => dayIndex > 0).sort((left, right) => left - right);
    }, [displayedDayPlans, suggestedDayIndex, tripDayCount]);
    const activeDayIndex = dayOptions.includes(targetDayIndex) ? targetDayIndex : suggestedDayIndex;
    const nextDayIndex = Math.min(tripDayCount, activeDayIndex + 1);
    const canGenerateNextDay = nextDayIndex > activeDayIndex;
    const activeDayPlan = displayedDayPlanByIndex.get(activeDayIndex);
    const hasActiveDayPlan = Boolean(activeDayPlan);
    const hasAllTripDayPlans = Array.from({length: tripDayCount}, (_, index) => index + 1)
        .every(dayIndex => displayedDayPlanByIndex.has(dayIndex));
    const activeDayDate = coreSlots.travelStartDate
        ? dayjs(coreSlots.travelStartDate).add(activeDayIndex - 1, "day").format("YYYY-MM-DD")
        : undefined;
    const nextDayDate = coreSlots.travelStartDate
        ? dayjs(coreSlots.travelStartDate).add(nextDayIndex - 1, "day").format("YYYY-MM-DD")
        : undefined;
    const selectedDayVersion = useMemo(
        () => typeof viewingSnapshotVersion === "number"
            ? dayVersions.find(record => record.dayVersion === viewingSnapshotVersion)
            : undefined,
        [dayVersions, viewingSnapshotVersion]
    );
    const currentDayVersion = useMemo(() => dayVersions.find(record => record.current), [dayVersions]);
    const snapshotSelectorValue = viewingSnapshotVersion === "latest" || !selectedDayVersion
        ? "latest"
        : String(viewingSnapshotVersion);
    const snapshotCountLabel = dayVersionsLoading
        ? `第 ${activeDayIndex} 天版本加载中`
        : dayVersions.length > 0
        ? `第 ${activeDayIndex} 天 · ${dayVersions.length} 个版本`
        : `第 ${activeDayIndex} 天暂无版本`;
    const communityDraftPayload = useMemo(() => ({
        title: (displayData.title || `${coreSlots.city || "旅行"} 行程规划`).slice(0, 120),
        content: displayData.markdown || "",
        contentFormat: "MARKDOWN" as const,
        category: "TRAVEL_NOTE" as const,
        destinationCityId: "",
        imageUrls: [] as string[],
    }), [coreSlots.city, displayData.markdown, displayData.title]);
    const canPublishCommunityPost = Boolean(session && displayData.markdown.trim());
    const canEditMarkdown = Boolean(conversation && !isSnapshotPreview && !chatSending && !assemblingTrip && displayData.snapshotVersion);
    const markdownEditDisabledReason = !conversation
        ? "Create a planner session first."
        : isSnapshotPreview
            ? "Historical versions are read-only. Return to latest before editing."
            : chatSending || assemblingTrip
                ? "Wait for the current AI generation to finish."
                : !displayData.snapshotVersion
                    ? "No saved planner version is available yet."
                    : "";

    useEffect(() => {
        viewingSnapshotVersionRef.current = viewingSnapshotVersion;
    }, [viewingSnapshotVersion]);

    useEffect(() => {
        selectedPlaceIdsRef.current = liveData.selectedPlaceIds;
    }, [liveData.selectedPlaceIds]);

    useEffect(() => {
        activeDayIndexRef.current = activeDayIndex;
    }, [activeDayIndex]);

    useEffect(() => {
        if (viewingSnapshotVersionRef.current === "latest") {
            setTargetDayIndex(suggestedDayIndex);
        }
    }, [suggestedDayIndex]);

    useEffect(() => {
        if (viewingSnapshotVersionRef.current === "latest") {
            setDisplayData(viewDataForDay(liveData, activeDayIndex));
        }
    }, [activeDayIndex, liveData]);

    useEffect(() => {
        if (!markdownDirty) {
            setMarkdownDraft(displayData.markdown || "");
            setMarkdownDraftBaseVersion(displayData.snapshotVersion);
        }
    }, [displayData.markdown, displayData.snapshotVersion, markdownDirty]);

    useEffect(() => {
        const session: PlannerStoredSession = {
            userId,
            form: formState,
            conversation,
            chatMessages,
            liveData,
            displayData,
            snapshots,
            plannerTraceEvents,
            viewingSnapshotVersion,
            markdownMode,
            targetDayIndex,
            activeRunId: activeRunId || undefined,
            activeRunStatus: activeRunStatus || undefined,
        };
        localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(session));
    }, [
        userId,
        formState,
        conversation,
        chatMessages,
        liveData,
        displayData,
        snapshots,
        plannerTraceEvents,
        viewingSnapshotVersion,
        markdownMode,
        targetDayIndex,
        activeRunId,
        activeRunStatus,
    ]);

    const applyCoreSlotsToForm = useCallback((slots: PlannerCoreSlots) => {
        const nextForm = formFromCoreSlots(slots);
        setDepartureCity(nextForm.departureCity);
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

    const loadDayVersions = useCallback(async (conversationId: string, dayIndex: number) => {
        setDayVersionsLoading(true);
        try {
            const response = await ApiRequests.listPlannerDayVersions(conversationId, userId, dayIndex);
            setDayVersions(response.data);
        } catch (error) {
            console.error(error);
            setDayVersions([]);
        } finally {
            setDayVersionsLoading(false);
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
            const serverRun = nextConversation.activeRun;
            if (serverRun) {
                activeRunIdRef.current = serverRun.runId;
                setActiveRunId(serverRun.runId);
                setActiveRunStatus(serverRun.status);
                plannerRunInFlightRef.current = serverRun.status === "RUNNING";
                setChatSending(serverRun.status === "RUNNING");
            }
            applyCoreSlotsToForm(nextConversation.coreSlots);
            setSnapshots(nextSnapshots);
            setLiveData(nextLiveData);

            if (currentView === "latest") {
                setDisplayData(nextLiveData);
            } else {
                setSnapshotView("latest");
                setDisplayData(nextLiveData);
            }
        } catch (error) {
            console.error(error);
            const status = (error as {response?: {status?: number}}).response?.status;
            if (status === 404 || status === 410) {
                const emptyData = emptyPlannerView();
                localStorage.removeItem(PLANNER_STORAGE_KEY);
                setConversation(null);
                setSnapshots([]);
                setDayVersions([]);
                setPlannerTraceEvents([]);
                setLiveData(emptyData);
                setDisplayData(emptyData);
                setSnapshotView("latest");
                setTargetDayIndex(1);
                setChatMessages([]);
                setErrorMessage("之前缓存的 AI 规划会话已随数据库重置清理，请重新开始规划。");
                return;
            }
            setErrorMessage("恢复 AI 规划会话失败，已保留本地缓存内容。请确认网关和 ai-arrange-service 可访问。");
        } finally {
            setHydrating(false);
        }
    }, [applyCoreSlotsToForm, setSnapshotView, userId]);

    const loadSnapshotDiff = useCallback(async (fromVersion: number) => {
        const toVersion = liveData.snapshotVersion;
        if (!conversation?.id || !toVersion || fromVersion === toVersion) {
            setSnapshotDiff(null);
            return;
        }

        setSnapshotDiffLoading(true);
        try {
            const response = await ApiRequests.diffPlannerSnapshots(conversation.id, userId, fromVersion, toVersion);
            setSnapshotDiff(response.data);
        } catch (error) {
            console.error(error);
            setSnapshotDiff(null);
        } finally {
            setSnapshotDiffLoading(false);
        }
    }, [conversation?.id, liveData.snapshotVersion, userId]);

    useEffect(() => {
        if (conversation?.id) {
            void refreshConversationFromServer(conversation.id);
        } else {
            setHydrating(false);
        }
    }, [conversation?.id, refreshConversationFromServer]);

    useEffect(() => {
        if (conversation?.id) {
            void loadDayVersions(conversation.id, activeDayIndex);
        } else {
            setDayVersions([]);
        }
    }, [activeDayIndex, conversation?.id, loadDayVersions]);

    useEffect(() => {
        setSnapshotDiff(null);
        setSnapshotDiffLoading(false);
    }, [activeDayIndex, viewingSnapshotVersion]);

    useEffect(() => {
        if (!dayVersionsLoading && typeof viewingSnapshotVersion === "number" && !selectedDayVersion) {
            setSnapshotView("latest");
            setDisplayData(liveData);
        }
    }, [dayVersionsLoading, liveData, selectedDayVersion, setSnapshotView, viewingSnapshotVersion]);

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

            wsReconnectAttemptsRef.current = 0;
            if (wsReconnectTimerRef.current) {
                clearTimeout(wsReconnectTimerRef.current);
                wsReconnectTimerRef.current = null;
            }
            setSocketStatus("connected");
            setErrorMessage(prevMessage => prevMessage === PLANNER_WS_RECONNECT_MESSAGE ? "" : prevMessage);
            sendPlannerEnvelope(socket, conversationId, "PLANNER_SYNC", {
                runId: activeRunIdRef.current,
            });
            void refreshConversationFromServer(conversationId);
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
                plannerRunInFlightRef.current = true;
                lastPlannerRunCompletedRef.current = false;
                sendPlannerEnvelope(socket, conversationId, "PLANNER_CHAT_SEND", {
                    message: seed.prompt,
                    selectedPlaceIds: selectedPlaceIdsRef.current,
                    modelVariant,
                    runId: seed.runId,
                });
                setChatSending(true);
            }
        };

        socket.onmessage = (event: MessageEvent<string>) => {
            const envelope = JSON.parse(event.data) as PlannerSocketEnvelope;

            if (envelope.type === "PLANNER_CHAT_STREAM") {
                const payload = envelope.payload as PlannerChatStreamPayload;
                if (!payload.runId || !activeRunIdRef.current || payload.runId === activeRunIdRef.current) {
                    appendAssistantDelta(payload);
                }
                return;
            }

            if (envelope.type === "PLANNER_RUN_STATE") {
                const payload = envelope.payload as PlannerRunStatePayload;
                const serverRun = payload.activeRun;
                if (serverRun && (!activeRunIdRef.current || serverRun.runId === activeRunIdRef.current)) {
                    activeRunIdRef.current = serverRun.runId;
                    setActiveRunId(serverRun.runId);
                    setActiveRunStatus(serverRun.status);
                    plannerRunInFlightRef.current = serverRun.status === "RUNNING";
                    setChatSending(serverRun.status === "RUNNING");
                    if (serverRun.status === "FAILED") {
                        setErrorMessage(serverRun.errorMessage || "AI 规划任务失败，请重新提交。");
                    }
                }
                return;
            }

            if (envelope.type === "PLANNER_TRACE_EVENT") {
                const payload = envelope.payload as PlannerTraceEvent;
                if (payload.runId && activeRunIdRef.current && payload.runId !== activeRunIdRef.current) return;
                setPlannerTraceEvents(prevEvents => [...prevEvents.slice(-11), payload]);
                if (payload.type === "RUN_FAILED") {
                    plannerRunInFlightRef.current = false;
                    lastPlannerRunCompletedRef.current = false;
                    setChatSending(false);
                    setActiveRunStatus("FAILED");
                }
                if (payload.type === "RUN_FINISHED") {
                    lastPlannerRunCompletedRef.current = true;
                    setActiveRunStatus("SUCCEEDED");
                }
                return;
            }

            if (envelope.type === "PLANNER_DATA_REFRESH") {
                const payload = envelope.payload as PlannerDataRefreshPayload;
                if (payload.runId && activeRunIdRef.current && payload.runId !== activeRunIdRef.current) return;
                applyLiveData(viewDataFromRefresh(payload));
                plannerRunInFlightRef.current = false;
                lastPlannerRunCompletedRef.current = true;
                setChatSending(false);
                setActiveRunStatus("SUCCEEDED");
                setErrorMessage(prevMessage => prevMessage === PLANNER_WS_RECONNECT_MESSAGE ? "" : prevMessage);
                void refreshSnapshotList(conversationId);
                void loadDayVersions(conversationId, payload.currentDayIndex || activeDayIndexRef.current);
                return;
            }

            if (envelope.type === "PLANNER_SNAPSHOT_SAVED") {
                plannerRunInFlightRef.current = false;
                lastPlannerRunCompletedRef.current = true;
                setChatSending(false);
                setErrorMessage(prevMessage => prevMessage === PLANNER_WS_RECONNECT_MESSAGE ? "" : prevMessage);
                void refreshConversationFromServer(conversationId);
                return;
            }

            if (envelope.type === "PLANNER_ERROR") {
                const payload = envelope.payload as PlannerErrorPayload;
                if (payload.runId && activeRunIdRef.current && payload.runId !== activeRunIdRef.current) return;
                plannerRunInFlightRef.current = false;
                lastPlannerRunCompletedRef.current = false;
                setErrorMessage(formatPlannerError(payload));
                setChatSending(false);
                setActiveRunStatus("FAILED");
            }
        };

        socket.onerror = () => {
            if (closedByCleanup) return;
            setSocketStatus("error");
            if (plannerRunInFlightRef.current && !lastPlannerRunCompletedRef.current) {
                setErrorMessage(PLANNER_WS_RECONNECT_MESSAGE);
            }
            if (!plannerRunInFlightRef.current) setChatSending(false);
        };

        socket.onclose = () => {
            if (closedByCleanup) return;
            if (plannerWSRef.current === socket) {
                plannerWSRef.current = null;
            }
            const completedNormally = lastPlannerRunCompletedRef.current;
            const wasPlanning = plannerRunInFlightRef.current;
            if (completedNormally) {
                plannerRunInFlightRef.current = false;
            }
            setSocketStatus(prevStatus => prevStatus === "error" && wasPlanning && !completedNormally ? "error" : "closed");
            if (!wasPlanning) setChatSending(false);
            if (completedNormally) {
                setErrorMessage(prevMessage => prevMessage === PLANNER_WS_RECONNECT_MESSAGE ? "" : prevMessage);
                window.setTimeout(() => refreshConversationFromServer(conversationId), 500);
            } else if (wasPlanning) {
                setErrorMessage(prevMessage => prevMessage || PLANNER_WS_RECONNECT_MESSAGE);
            }

            if (!wsReconnectTimerRef.current) {
                const reconnectDelay = Math.min(10000, 1000 * Math.max(1, wsReconnectAttemptsRef.current + 1));
                wsReconnectTimerRef.current = setTimeout(() => {
                    wsReconnectTimerRef.current = null;
                    wsReconnectAttemptsRef.current += 1;
                    setWsReconnectNonce(value => value + 1);
                }, reconnectDelay);
            }
        };

        return () => {
            closedByCleanup = true;
            if (wsReconnectTimerRef.current) {
                clearTimeout(wsReconnectTimerRef.current);
                wsReconnectTimerRef.current = null;
            }
            socket.close();
            if (plannerWSRef.current === socket) {
                plannerWSRef.current = null;
            }
        };
    }, [
        appendAssistantDelta,
        applyLiveData,
        conversation?.id,
        loadDayVersions,
        modelVariant,
        refreshConversationFromServer,
        refreshSnapshotList,
        sendPlannerEnvelope,
        userId,
        wsReconnectNonce,
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
                runId: uuidv4(),
            };
            activeRunIdRef.current = pendingInitialPromptRef.current.runId;
            activeRunStatusRef.current = "RUNNING";
            setActiveRunId(pendingInitialPromptRef.current.runId);
            setActiveRunStatus("RUNNING");
            setConversation(nextConversation);
            setLiveData(nextData);
            setDisplayData(nextData);
            setSnapshots([]);
            setDayVersions([]);
            setPlannerTraceEvents([]);
            setSnapshotView("latest");
            setMarkdownDraft(nextData.markdown || "");
            setMarkdownDraftBaseVersion(nextData.snapshotVersion);
            setMarkdownDirty(false);
            setMarkdownSaving(false);
            setTargetDayIndex(1);
            setAssemblingTrip(false);
            setChatMessages([]);
        } catch (error) {
            console.error(error);
            setErrorMessage("创建 AI 规划会话失败，请确认网关 /ai-arrange/api/conversations 可访问。");
        } finally {
            setCreating(false);
        }
    };

    const applySnapshotToPlannerState = useCallback((snapshot: PlannerSnapshot, preferredDayIndex?: number) => {
        const nextData = viewDataFromSnapshot(snapshot);

        setConversation(prevConversation => prevConversation ? {
            ...prevConversation,
            title: snapshot.title || prevConversation.title,
            currentMarkdown: snapshot.markdown || "",
            latestSnapshotVersion: snapshot.version,
            selectedPlaceIds: snapshot.selectedPlaceIds || [],
            updatedAt: snapshot.createdAt || prevConversation.updatedAt,
        } : prevConversation);
        setSnapshots(prevSnapshots => sortSnapshots([
            snapshot,
            ...prevSnapshots.filter(item => item.id !== snapshot.id),
        ]));
        setLiveData(nextData);
        setDisplayData(nextData);
        setSnapshotView("latest");
        setSnapshotDiff(null);
        setMarkdownDraft(nextData.markdown || "");
        setMarkdownDraftBaseVersion(nextData.snapshotVersion);
        setMarkdownDirty(false);
        setMarkdownSaving(false);
        setTargetDayIndex(snapshot.currentDayIndex || snapshot.targetDayIndex || preferredDayIndex || 1);
    }, [setSnapshotView]);

    const sendPlannerActionMessage = async (message: string, extraPayload: Partial<PlannerChatSendPayload> = {}) => {
        const trimmedInput = message.trim();
        if (!trimmedInput || !conversation) return;

        if (isSnapshotPreview) {
            setErrorMessage("历史快照为只读状态，请先切回最新版本再继续操作。");
            return;
        }

        const socket = plannerWSRef.current;
        const runId = extraPayload.runId || uuidv4();
        const payload: PlannerChatSendPayload = {
            message: trimmedInput,
            selectedPlaceIds: liveData.selectedPlaceIds,
            modelVariant,
            ...extraPayload,
            runId,
        };
        setChatMessages(prevMessages => [
            ...prevMessages,
            {id: uuidv4(), role: "user", text: trimmedInput}
        ]);
        setErrorMessage("");
        setPlannerTraceEvents([]);
        plannerRunInFlightRef.current = true;
        lastPlannerRunCompletedRef.current = false;
        activeRunIdRef.current = runId;
        activeRunStatusRef.current = "RUNNING";
        setActiveRunId(runId);
        setActiveRunStatus("RUNNING");
        setChatSending(true);

        if (socket && socket.readyState === WebSocket.OPEN) {
            sendPlannerEnvelope(socket, conversation.id, "PLANNER_CHAT_SEND", payload);
            return;
        }

        setChatMessages(prevMessages => [
            ...prevMessages,
            {
                id: uuidv4(),
                role: "system",
                text: "规划连接已关闭，已改用非流式方式生成并保存快照。",
            }
        ]);

        try {
            const response = await ApiRequests.runPlannerAgent(conversation.id, {
                ...payload,
                userId,
            });
            applySnapshotToPlannerState(response.data, payload.targetDayIndex);
            lastPlannerRunCompletedRef.current = true;
            activeRunStatusRef.current = "SUCCEEDED";
            setActiveRunStatus("SUCCEEDED");
            setChatMessages(prevMessages => [
                ...prevMessages,
                {
                    id: uuidv4(),
                    role: "assistant",
                    text: response.data.assistantText || response.data.summary || "日计划已生成。",
                }
            ]);
            void refreshSnapshotList(conversation.id);
            void loadDayVersions(conversation.id, payload.targetDayIndex || activeDayIndex);
        } catch (error) {
            console.error(error);
            activeRunStatusRef.current = "FAILED";
            setActiveRunStatus("FAILED");
            setErrorMessage("生成日计划失败，请确认 ai-arrange-service 与 Python Agent 可用后重试。");
        } finally {
            plannerRunInFlightRef.current = false;
            setChatSending(false);
        }
    };

    const sendChatMessage = (message: string) => {
        const trimmedInput = message.trim();
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
        setErrorMessage("");
        setPlannerTraceEvents([]);
        const runId = uuidv4();
        plannerRunInFlightRef.current = true;
        lastPlannerRunCompletedRef.current = false;
        activeRunIdRef.current = runId;
        activeRunStatusRef.current = "RUNNING";
        setActiveRunId(runId);
        setActiveRunStatus("RUNNING");
        sendPlannerEnvelope(socket, conversation.id, "PLANNER_CHAT_SEND", {
            message: trimmedInput,
            selectedPlaceIds: liveData.selectedPlaceIds,
            modelVariant,
            runId,
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
            const nextData = viewDataForDay(liveData, activeDayIndex);
            setSnapshotView("latest");
            setDisplayData(nextData);
            setMarkdownDraft(nextData.markdown || "");
            setMarkdownDraftBaseVersion(nextData.snapshotVersion);
            setMarkdownDirty(false);
            return;
        }

        const dayVersionValue = Number(value);
        const dayVersion = dayVersions.find(record => record.dayVersion === dayVersionValue);
        if (!dayVersion) return;

        const nextData = viewDataFromDayVersion(dayVersion, liveData);
        setSnapshotView(dayVersionValue);
        setDisplayData(nextData);
        setMarkdownDraft(nextData.markdown || "");
        setMarkdownDraftBaseVersion(nextData.snapshotVersion);
        setMarkdownDirty(false);
    };

    const handleRestoreSnapshot = async () => {
        if (!conversation || typeof viewingSnapshotVersion !== "number") return;

        const dayVersion = viewingSnapshotVersion;
        const dayIndex = selectedDayVersion?.dayIndex || activeDayIndex;
        const dayVersionLabel = selectedDayVersion ? `第 ${dayIndex} 天 v${selectedDayVersion.dayVersion}` : `第 ${dayIndex} 天`;
        setRestoringVersion(dayVersion);
        setErrorMessage("");
        try {
            const response = await ApiRequests.activatePlannerDayVersion(conversation.id, userId, dayIndex, dayVersion);
            const restoredSnapshot = response.data;
            const restoredData = viewDataFromSnapshot(restoredSnapshot);

            setConversation(prevConversation => prevConversation ? {
                ...prevConversation,
                title: restoredSnapshot.title || prevConversation.title,
                currentMarkdown: restoredSnapshot.markdown || "",
                latestSnapshotVersion: restoredSnapshot.version,
                selectedPlaceIds: restoredSnapshot.selectedPlaceIds || [],
                updatedAt: restoredSnapshot.createdAt || prevConversation.updatedAt,
            } : prevConversation);
            setSnapshots(prevSnapshots => sortSnapshots([
                restoredSnapshot,
                ...prevSnapshots.filter(snapshot => snapshot.id !== restoredSnapshot.id),
            ]));
            setLiveData(restoredData);
            setDisplayData(viewDataForDay(restoredData, dayIndex));
            setSnapshotView("latest");
            setSnapshotDiff(null);
            setTargetDayIndex(restoredSnapshot.currentDayIndex || restoredSnapshot.targetDayIndex || dayIndex);
            setChatMessages(prevMessages => [
                ...prevMessages,
                {
                    id: uuidv4(),
                    role: "system",
                    text: `已将 ${dayVersionLabel} 设为当前版本，其他日期保持最新内容。`,
                }
            ]);
            void refreshSnapshotList(conversation.id);
            void loadDayVersions(conversation.id, dayIndex);
        } catch (error) {
            console.error(error);
            setErrorMessage(`恢复第 ${dayIndex} 天失败，请检查 ai-arrange-service 后重试。`);
        } finally {
            setRestoringVersion(null);
        }
    };

    const handleAssembleTrip = async () => {
        if (!conversation) return;

        if (isSnapshotPreview) {
            setErrorMessage("历史快照为只读状态，请先切回最新版本再汇总行程。");
            return;
        }

        setAssemblingTrip(true);
        setErrorMessage("");
        try {
            const response = await ApiRequests.assemblePlannerTripSnapshot(conversation.id, userId);
            const assembledSnapshot = response.data;
            const assembledData = viewDataFromSnapshot(assembledSnapshot);

            setConversation(prevConversation => prevConversation ? {
                ...prevConversation,
                title: assembledSnapshot.title || prevConversation.title,
                currentMarkdown: assembledSnapshot.markdown || "",
                latestSnapshotVersion: assembledSnapshot.version,
                selectedPlaceIds: assembledSnapshot.selectedPlaceIds || [],
                updatedAt: assembledSnapshot.createdAt || prevConversation.updatedAt,
            } : prevConversation);
            setSnapshots(prevSnapshots => sortSnapshots([
                assembledSnapshot,
                ...prevSnapshots.filter(snapshot => snapshot.id !== assembledSnapshot.id),
            ]));
            setLiveData(assembledData);
            setDisplayData(assembledData);
            setSnapshotView("latest");
            setSnapshotDiff(null);
            setTargetDayIndex(assembledSnapshot.currentDayIndex || assembledSnapshot.targetDayIndex || activeDayIndex);
            setChatMessages(prevMessages => [
                ...prevMessages,
                {
                    id: uuidv4(),
                    role: "system",
                    text: `已在后端本地汇总完整行程，保存为新的全局 v${assembledSnapshot.version}。`,
                }
            ]);
            void refreshSnapshotList(conversation.id);
        } catch (error) {
            console.error(error);
            setErrorMessage("汇总完整行程失败，请确认至少已有日计划快照后重试。");
        } finally {
            setAssemblingTrip(false);
        }
    };

    const handleMarkdownChange = (nextMarkdown: string) => {
        if (isSnapshotPreview) return;
        setMarkdownDraft(nextMarkdown);
        setMarkdownDirty(nextMarkdown !== (displayData.markdown || ""));
    };

    const discardMarkdownDraft = () => {
        setMarkdownDraft(displayData.markdown || "");
        setMarkdownDraftBaseVersion(displayData.snapshotVersion);
        setMarkdownDirty(false);
    };

    const saveMarkdownDraft = async () => {
        if (!conversation || !displayData.snapshotVersion || !markdownDraftBaseVersion || isSnapshotPreview || chatSending || assemblingTrip) return;

        const trimmedMarkdown = markdownDraft.trim();
        if (!trimmedMarkdown) {
            setErrorMessage("Markdown content cannot be empty.");
            return;
        }

        const mode = isTripMarkdownScope(displayData.scope) ? "TRIP" : "DAY";
        setMarkdownSaving(true);
        setErrorMessage("");
        try {
            const response = await ApiRequests.createPlannerMarkdownSnapshot(conversation.id, {
                userId,
                markdown: markdownDraft,
                mode,
                dayIndex: mode === "DAY" ? activeDayIndex : undefined,
                baseVersion: markdownDraftBaseVersion,
            });
            const savedSnapshot = response.data;
            const savedData = viewDataFromSnapshot(savedSnapshot);
            const nextDayIndex = savedSnapshot.currentDayIndex || savedSnapshot.targetDayIndex || activeDayIndex;

            setConversation(prevConversation => prevConversation ? {
                ...prevConversation,
                title: savedSnapshot.title || prevConversation.title,
                currentMarkdown: savedSnapshot.markdown || "",
                latestSnapshotVersion: savedSnapshot.version,
                selectedPlaceIds: savedSnapshot.selectedPlaceIds || [],
                updatedAt: savedSnapshot.createdAt || prevConversation.updatedAt,
            } : prevConversation);
            setSnapshots(prevSnapshots => sortSnapshots([
                savedSnapshot,
                ...prevSnapshots.filter(snapshot => snapshot.id !== savedSnapshot.id),
            ]));
            setLiveData(savedData);
            setDisplayData(mode === "DAY" ? viewDataForDay(savedData, nextDayIndex) : savedData);
            setSnapshotView("latest");
            setSnapshotDiff(null);
            setMarkdownDirty(false);
            setMarkdownDraftBaseVersion(savedSnapshot.version);
            setMarkdownMode("preview");
            setTargetDayIndex(nextDayIndex);
            setChatMessages(prevMessages => [
                ...prevMessages,
                {
                    id: uuidv4(),
                    role: "system",
                    text: `Manual Markdown edit saved as v${savedSnapshot.version}.`,
                }
            ]);
            void refreshSnapshotList(conversation.id);
            if (mode === "DAY") {
                void loadDayVersions(conversation.id, nextDayIndex);
            }
        } catch (error) {
            console.error(error);
            setErrorMessage("Markdown save failed. The plan may have a newer version; please review the latest version and save again.");
        } finally {
            setMarkdownSaving(false);
        }
    };

    const resetPlanner = () => {
        plannerWSRef.current?.close();
        pendingInitialPromptRef.current = null;
        plannerRunInFlightRef.current = false;
        lastPlannerRunCompletedRef.current = false;
        localStorage.removeItem(PLANNER_STORAGE_KEY);

        const nextForm = defaultPlannerForm();
        const nextData = emptyPlannerView();

        setConversation(null);
        setSocketStatus("idle");
        setCreating(false);
        setHydrating(false);
        setChatSending(false);
        setErrorMessage("");
        setChatMessages([]);
        setLiveData(nextData);
        setDisplayData(nextData);
        setSnapshots([]);
        setPlannerTraceEvents([]);
        setSnapshotView("latest");
        setMarkdownMode("preview");
        setMarkdownDraft(nextData.markdown || "");
        setMarkdownDraftBaseVersion(nextData.snapshotVersion);
        setMarkdownDirty(false);
        setMarkdownSaving(false);
        setSnapshotDiff(null);
        setSnapshotDiffLoading(false);
        setRestoringVersion(null);
        setDayVersions([]);
        setDayVersionsLoading(false);
        setAssemblingTrip(false);
        setTargetDayIndex(1);

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
        plannerRunInFlightRef.current = false;
        lastPlannerRunCompletedRef.current = false;

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
        setMarkdownMode("preview");
        setMarkdownDraft(nextData.markdown || "");
        setMarkdownDraftBaseVersion(nextData.snapshotVersion);
        setMarkdownDirty(false);
        setMarkdownSaving(false);
        setSnapshotDiff(null);
        setSnapshotDiffLoading(false);
        setRestoringVersion(null);
        setDayVersions([]);
        setDayVersionsLoading(false);
        setAssemblingTrip(false);
        setTargetDayIndex(1);
    };

    const handleModelVariantChange = (value: string) => {
        setModelVariant(value === "PRO" ? "PRO" : "FLASH");
    };

    const openCommunityPublishDialog = () => {
        if (!session) {
            setErrorMessage("请先登录后再转发到社区。");
            return;
        }
        if (!displayData.markdown.trim()) {
            setErrorMessage("当前还没有可转发的 Markdown 行程。");
            return;
        }
        setCommunityPublishOpen(true);
    };

    const handleCommunityPublished = (postId?: string) => {
        setCommunityPublishOpen(false);
        if (postId) {
            navigate(`/community/posts/${postId}`);
        }
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

    const renderFreeSoloInput = (
        label: string,
        value: string,
        onChange: (value: string) => void,
        options: string[],
        props?: {
            required?: boolean,
            placeholder?: string,
        }
    ) => (
        <Autocomplete
            freeSolo
            forcePopupIcon
            options={options}
            value={value}
            inputValue={value}
            onChange={(_, nextValue) => onChange(nextValue || "")}
            onInputChange={(_, nextInputValue) => onChange(nextInputValue)}
            renderInput={params => (
                <TextField
                    {...params}
                    label={label}
                    required={props?.required}
                    placeholder={props?.placeholder}
                    fullWidth
                />
            )}
        />
    );

    const renderPeopleCountInput = () => (
        <Autocomplete
            freeSolo
            forcePopupIcon
            options={PEOPLE_COUNT_QUICK_OPTIONS}
            value={String(peopleCount)}
            inputValue={String(peopleCount)}
            onChange={(_, nextValue) => setPeopleCount(Math.max(1, Number(nextValue) || 1))}
            onInputChange={(_, nextInputValue) => {
                if (nextInputValue === "") {
                    setPeopleCount(1);
                    return;
                }
                setPeopleCount(Math.max(1, Number(nextInputValue) || 1));
            }}
            renderInput={params => (
                <TextField
                    {...params}
                    label="人数"
                    required
                    fullWidth
                    type="number"
                    inputProps={{...params.inputProps, min: 1}}
                />
            )}
        />
    );

    const renderSnapshotDiffPanel = () => {
        if (!isSnapshotPreview) return null;

        const restoreLabel = selectedDayVersion
            ? `设为当前：第 ${selectedDayVersion.dayIndex} 天 v${selectedDayVersion.dayVersion}`
            : `设为当前：第 ${activeDayIndex} 天`;

        if (snapshotDiffLoading) {
            return (
                <div className="mx-4 mt-3 rounded-md border border-gray-200 bg-white px-4 py-3">
                    <LinearProgress/>
                </div>
            );
        }

        if (!snapshotDiff || snapshotDiff.changes.length === 0) {
            return (
                <Alert severity="info" className="mx-4 mt-3" action={
                    <Button
                        color="inherit"
                        size="small"
                        startIcon={<Restore/>}
                        disabled={restoringVersion !== null}
                        onClick={handleRestoreSnapshot}
                    >
                        {restoreLabel}
                    </Button>
                }>
                    当前正在只读查看日版本。设为当前时只会切换当前选中的日期。
                </Alert>
            );
        }

        return (
            <div className="mx-4 mt-3 rounded-md border border-gray-200 bg-[#fbfcff] px-4 py-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-gray-800">
                        <History fontSize="small"/>
                        <Typography variant="subtitle2">
                            {selectedDayVersion ? `第 ${selectedDayVersion.dayIndex} 天 v${selectedDayVersion.dayVersion}` : `第 ${activeDayIndex} 天历史版本`}
                        </Typography>
                    </div>
                    <div className="flex items-center gap-2">
                        <Chip size="small" variant="outlined" label={`${snapshotDiff.changes.length} 项变化`}/>
                        <Button
                            size="small"
                            variant="contained"
                            startIcon={<Restore/>}
                            disabled={restoringVersion !== null}
                            onClick={handleRestoreSnapshot}
                        >
                            {restoringVersion === viewingSnapshotVersion ? "恢复中" : restoreLabel}
                        </Button>
                    </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                    {snapshotDiff.changes.map(change => (
                        <div key={`${change.field}-${change.type}`} className="rounded-md border border-gray-200 bg-white px-3 py-2">
                            <div className="mb-1 flex items-center justify-between gap-2">
                                <Typography variant="body2" className="font-medium">{change.label || change.field}</Typography>
                                <Chip size="small" color={diffTypeColor(change.type)} variant="outlined" label={diffTypeLabel(change.type)}/>
                            </div>
                            <Typography variant="caption" color="text.secondary">
                                {change.summary || "已变化"}
                            </Typography>
                        </div>
                    ))}
                </div>
            </div>
        );
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

    const navigateToBookingLink = (link: PlannerBookingLink) => {
        if (!link.url) return;
        const normalizedUrl = normalizeBookingUrl(link.url);
        if (normalizedUrl) {
            navigate(normalizedUrl);
            return;
        }
    };

    const normalizeBookingUrl = (url: string) => {
        const trimmed = url.trim();
        const exampleMatch = trimmed.match(/^https?:\/\/example\.com(\/reservations\/(?:hotels(?:\/[^\s?#)]+)?|trains|flights)(?:[?#][^\s)]*)?)$/i);
        if (exampleMatch) {
            return exampleMatch[1];
        }
        if (/^\/reservations\/(?:hotels(?:\/[^\s?#)]+)?|trains|flights)(?:[?#].*)?$/i.test(trimmed)) {
            return trimmed;
        }
        return null;
    };

    const bookingIcon = (type?: string) => {
        if (type === "HOTEL") return <Hotel/>;
        if (type === "TRAIN") return <Train/>;
        if (type === "FLIGHT") return <Flight/>;
        return <TravelExplore/>;
    };

    const renderDayPlanBar = () => {
        if (!conversation) return null;

        const dayPlanByIndex = new Map(displayedDayPlans.map(dayPlan => [dayPlan.dayIndex || 0, dayPlan]));
        return (
            <section className="shrink-0 rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <CalendarMonth style={{fontSize: 20, color: "#556cd6"}}/>
                        {displayedDayPlans.length > 0 ? displayedDayPlans.map(dayPlan => {
                            const dayIndex = dayPlan.dayIndex || 0;
                            const isActiveDay = dayIndex === activeDayIndex;
                            const status = completedDaySet.has(dayIndex) ? "CONFIRMED" : dayPlan.status;
                            return (
                                <Chip
                                    key={`${dayIndex}-${dayPlan.title || "day"}`}
                                    size="small"
                                    color={isActiveDay ? "primary" : dayPlanStatusColor(status)}
                                    variant={isActiveDay ? "filled" : "outlined"}
                                    label={`第 ${dayIndex || "?"} 天${dayPlan.title ? ` · ${dayPlan.title}` : ""} · ${dayPlanStatusLabel(status)}`}
                                    sx={{maxWidth: 220}}
                                />
                            );
                        }) : (
                            <Chip size="small" variant="outlined" label="日计划待生成"/>
                        )}
                    </div>

                    <Chip
                        size="small"
                        color="primary"
                        variant="filled"
                        label={`当前操作：第 ${activeDayIndex} 天${activeDayDate ? `（${activeDayDate}）` : ""}`}
                    />

                    <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={activeDayIndex}
                        onChange={(_, value) => {
                            if (value) setTargetDayIndex(Number(value));
                        }}
                        disabled={isSnapshotPreview || chatSending || assemblingTrip}
                    >
                        {dayOptions.map(dayIndex => {
                            const status = completedDaySet.has(dayIndex)
                                ? "CONFIRMED"
                                : dayPlanByIndex.get(dayIndex)?.status;
                            return (
                                <ToggleButton key={dayIndex} value={dayIndex}>
                                    第 {dayIndex} 天{status === "CONFIRMED" ? "（已确认）" : ""}
                                </ToggleButton>
                            );
                        })}
                    </ToggleButtonGroup>
                </div>
            </section>
        );
    };

    const renderTripBar = () => (
        <div className="grid shrink-0 gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 md:grid-cols-3">
            <div className="flex items-center gap-2 text-gray-700">
                <LocationOn style={{fontSize: 20, color: "#556cd6"}}/>
                <span>{coreSlots.departureCity ? `${coreSlots.departureCity} → ${coreSlots.city}` : coreSlots.city}</span>
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
                    <div className="grid gap-4 md:grid-cols-2">
                        {renderFreeSoloInput("出发城市", departureCity, setDepartureCity, CITY_QUICK_OPTIONS, {placeholder: "例如：北京"})}
                        {renderFreeSoloInput("旅游城市", city, setCity, CITY_QUICK_OPTIONS, {required: true})}
                    </div>

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
                        {renderPeopleCountInput()}
                        {renderModelVariantSelect(true)}
                    </div>

                    <Button
                        type="button"
                        variant="text"
                        endIcon={<ExpandMore sx={{transform: showAdvancedOptions ? "rotate(180deg)" : "none", transition: "transform 160ms"}}/>}
                        onClick={() => setShowAdvancedOptions(value => !value)}
                        sx={{justifyContent: "space-between", px: 0, color: "text.primary"}}
                    >
                        高级偏好（可选）
                    </Button>
                    <Collapse in={showAdvancedOptions}>
                        <div className="grid gap-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                {renderFreeSoloInput("旅行偏好", travelStyle, setTravelStyle, TRAVEL_STYLE_QUICK_OPTIONS)}
                                {renderFreeSoloInput("预算", budget, setBudget, BUDGET_QUICK_OPTIONS, {placeholder: "例如：人均 3000"})}
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                {renderFreeSoloInput("住宿偏好", accommodationPreference, setAccommodationPreference, ACCOMMODATION_QUICK_OPTIONS, {placeholder: "例如：地铁附近、亲子酒店"})}
                                {renderFreeSoloInput("交通偏好", transportPreference, setTransportPreference, TRANSPORT_QUICK_OPTIONS, {placeholder: "例如：少打车、公共交通优先"})}
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                {renderFreeSoloInput("想去的地点/关键词", mustVisitKeywords, setMustVisitKeywords, MUST_VISIT_QUICK_OPTIONS, {placeholder: "外滩、博物馆、咖啡"})}
                                {renderFreeSoloInput("需要避开的内容", avoidKeywords, setAvoidKeywords, AVOID_QUICK_OPTIONS, {placeholder: "夜市、排队过久"})}
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
                    </Collapse>
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
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 text-gray-700">
                    <EditNote fontSize="small"/>
                    <Typography variant="subtitle1" className="truncate">规划 Markdown</Typography>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Tooltip title={!session ? "登录后可转发到社区" : displayData.markdown.trim() ? "转发当前 Markdown 行程到社区" : "暂无可转发内容"}>
                        <span>
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<Send fontSize="small"/>}
                                disabled={!canPublishCommunityPost}
                                onClick={openCommunityPublishDialog}
                            >
                                转发社区
                            </Button>
                        </span>
                    </Tooltip>
                    <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={markdownMode}
                        onChange={(_, value) => {
                            if (!value) return;
                            if (value === "edit" && !canEditMarkdown) {
                                setErrorMessage(markdownEditDisabledReason);
                                return;
                            }
                            setMarkdownMode(value);
                        }}
                    >
                        <ToggleButton value="preview">
                            <Visibility fontSize="small" className="mr-1"/>
                            预览
                        </ToggleButton>
                        <ToggleButton value="edit" disabled={!canEditMarkdown}>
                            <Code fontSize="small" className="mr-1"/>
                            编辑
                        </ToggleButton>
                    </ToggleButtonGroup>
                    {markdownMode === "edit" &&
                        <>
                            <Button
                                size="small"
                                variant="contained"
                                startIcon={<Save fontSize="small"/>}
                                disabled={!markdownDirty || !canEditMarkdown || !markdownDraftBaseVersion || markdownSaving}
                                onClick={saveMarkdownDraft}
                            >
                                保存为新版本
                            </Button>
                            <Button
                                size="small"
                                variant="outlined"
                                disabled={!markdownDirty || markdownSaving}
                                onClick={discardMarkdownDraft}
                            >
                                取消修改
                            </Button>
                        </>
                    }
                    <Chip size="small" variant="outlined" icon={<History/>} label={snapshotCountLabel}/>
                    <TextField
                        select
                        size="small"
                        label={`第 ${activeDayIndex} 天版本`}
                        value={snapshotSelectorValue}
                        onChange={event => handleSnapshotChange(event.target.value)}
                        sx={{minWidth: 210}}
                    >
                        <MenuItem value="latest">
                            当前版本{currentDayVersion ? `（v${currentDayVersion.dayVersion}）` : ""}
                        </MenuItem>
                        {dayVersions.map(record => (
                            <MenuItem key={`${record.dayIndex}-${record.dayVersion}`} value={String(record.dayVersion)}>
                                第 {record.dayIndex} 天 v{record.dayVersion}{record.current ? " · 当前使用" : ""} · {dayjs(record.createdAt).isValid() ? dayjs(record.createdAt).format("MM-DD HH:mm") : "历史版本"}
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
                    正在只读回看第 {activeDayIndex} 天的历史版本。切回当前版本后才能继续对话和调整点位。
                </Alert>
            }

            {markdownMode === "edit" && markdownDirty &&
                <Alert severity="warning" className="mx-4 mt-3">
                    当前修改仅保存在本地草稿中，点击“保存为新版本”后才会上传并进入版本历史。
                </Alert>
            }

            {renderSnapshotDiffPanel()}

            <div className="min-h-0 flex-1 overflow-hidden px-4 py-3">
                {displayData.summary &&
                    <Typography variant="body2" color="text.secondary" className="mb-3">{displayData.summary}</Typography>
                }

                {markdownMode === "preview" ? (
                    <div className="h-full overflow-y-auto rounded-md border border-gray-200 bg-white px-5 py-4 text-[15px] leading-7">
                        {displayData.markdown
                            ? <MarkdownPreview markdown={displayData.markdown}/>
                            : <Typography variant="body2" color="text.secondary">AI 生成的规划会显示在这里。</Typography>
                        }
                    </div>
                ) : (
                    <div className="h-full min-h-0">
                        <TextField
                            value={markdownDraft}
                            onChange={event => handleMarkdownChange(event.target.value)}
                            placeholder="AI 生成的 Markdown 规划会显示在这里。"
                            multiline
                            fullWidth
                            InputProps={{readOnly: !canEditMarkdown || markdownSaving}}
                            sx={{
                                height: "100%",
                                "& .MuiInputBase-root": {
                                    height: "100%",
                                    alignItems: "flex-start",
                                },
                                "& textarea": {
                                    height: "100% !important",
                                    overflow: "auto !important",
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
                )}
            </div>
        </section>
    );

    const renderRecommendationsPanel = () => (
        <section className="flex min-h-0 flex-[1.35] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
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
                        const bookingLinks = (place.bookingLinks || []).filter(link => Boolean(link.url && normalizeBookingUrl(link.url)));
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
                                    {place.internalOfferId && bookingLinks.length === 0 &&
                                        <Button
                                            size="small"
                                            variant="text"
                                            startIcon={<Hotel/>}
                                            onClick={() => navigateToInternalOffer(place)}
                                        >
                                            去预订
                                        </Button>
                                    }
                                    {bookingLinks.map(link => (
                                        <Button
                                            key={`${place.placeId}-${link.type}-${link.url}`}
                                            size="small"
                                            variant="text"
                                            startIcon={bookingIcon(link.type)}
                                            onClick={() => navigateToBookingLink(link)}
                                        >
                                            {link.label || "去预订"}
                                        </Button>
                                    ))}
                                </div>
                            </Paper>
                        );
                    })}
                </div>
            </div>
        </section>
    );

    const renderPlanningReferencePanels = () => (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
            <PlannerMapPanel
                places={displayData.places}
                routes={displayData.routes}
                selectedPlaceIds={displayData.selectedPlaceIds}
                readOnly={isSnapshotPreview}
                onTogglePlace={togglePlaceSelection}
            />
            <Button
                type="button"
                variant="outlined"
                size="small"
                endIcon={<ExpandMore sx={{transform: showRecommendations ? "rotate(180deg)" : "none", transition: "transform 160ms"}}/>}
                onClick={() => setShowRecommendations(value => !value)}
                sx={{flexShrink: 0, justifyContent: "space-between"}}
            >
                AI 推荐选项 {displayData.places.length > 0 ? `（${displayData.places.length}）` : ""}
            </Button>
            <Collapse in={showRecommendations} className="min-h-0 flex-1">
                {renderRecommendationsPanel()}
            </Collapse>
        </div>
    );

    return (
        <div className="h-[calc(100dvh+320px)] overflow-hidden bg-[#f6f7fb]">
            <div className="flex h-full min-h-0 flex-col gap-3 p-4">
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

                {(creating || chatSending || hydrating || assemblingTrip) &&
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

                {!conversation ? (
                    <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
                        <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
                            {renderSlotForm()}
                        </div>
                        {renderPlanningReferencePanels()}
                    </div>
                ) : (
                    <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[440px_minmax(0,1fr)]">
                        {renderPlanningReferencePanels()}
                        <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
                            {renderTripBar()}
                            {renderDayPlanBar()}
                            {renderMarkdownPanel()}
                        </div>
                    </div>
                )}
            </div>
            <FloatingAiAssistant
                conversationActive={Boolean(conversation)}
                socketStatus={socketStatus}
                busy={chatSending || assemblingTrip}
                busyLabel={assemblingTrip ? "正在汇总完整行程" : traceMessage(currentTraceEvent) || "AI 正在生成中"}
                chatMessages={chatMessages}
                progressEvents={recentTraceEvents}
                currentProgressMessage={assemblingTrip ? "正在汇总完整行程" : traceMessage(currentTraceEvent) || (chatSending ? "正在等待规划引擎响应..." : "规划任务已结束。")}
                currentProgressStatus={currentTraceEvent?.status || (chatSending || assemblingTrip ? "RUNNING" : "SUCCESS")}
                isSnapshotPreview={isSnapshotPreview}
                activeDayIndex={activeDayIndex}
                activeDayDate={activeDayDate}
                nextDayIndex={nextDayIndex}
                nextDayDate={nextDayDate}
                hasActiveDayPlan={hasActiveDayPlan}
                canGenerateNextDay={canGenerateNextDay}
                hasAllTripDayPlans={hasAllTripDayPlans}
                generatedDayCount={displayedDayPlans.length}
                tripDayCount={tripDayCount}
                hasDepartureCity={Boolean(coreSlots.departureCity)}
                places={liveData.places}
                selectedPlaceIds={liveData.selectedPlaceIds}
                traceToolLabel={traceToolLabel}
                traceStatusLabel={traceStatusLabel}
                traceStatusColor={traceStatusColor}
                onPlannerAction={sendPlannerActionMessage}
                onAssembleTrip={handleAssembleTrip}
                onSendChat={sendChatMessage}
            />
            <PostPublishDialog
                open={communityPublishOpen}
                token={session?.token}
                initialPayload={communityDraftPayload}
                onClose={() => setCommunityPublishOpen(false)}
                onPublished={handleCommunityPublished}
            />
        </div>
    );
}
