import React, {KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState} from "react";
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    Fab,
    IconButton,
    LinearProgress,
    Paper,
    TextField,
    Tooltip,
    Typography,
    useMediaQuery
} from "@mui/material";
import {
    AutoAwesome,
    AutoFixHigh,
    ChildCare,
    Close,
    ExpandMore,
    Flight,
    Hotel,
    PlaylistAdd,
    Restaurant,
    Send,
    SwapCalls,
    TaskAlt,
    Train,
    TravelExplore,
    Tune
} from "@mui/icons-material";
import {PlannerChatSendPayload, PlannerTraceEvent} from "../../core/apiConfig";

type AssistantSocketStatus = "idle" | "connecting" | "connected" | "closed" | "error";
type AssistantStatusColor = "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning";

interface AssistantChatMessage {
    id: string,
    role: "user" | "assistant" | "system",
    text: string,
    streaming?: boolean,
}

interface FloatingAiAssistantProps {
    conversationActive: boolean,
    socketStatus: AssistantSocketStatus,
    busy: boolean,
    busyLabel: string,
    chatMessages: AssistantChatMessage[],
    progressEvents: PlannerTraceEvent[],
    currentProgressMessage: string,
    currentProgressStatus: string,
    isSnapshotPreview: boolean,
    activeDayIndex: number,
    activeDayDate?: string,
    nextDayIndex: number,
    nextDayDate?: string,
    hasActiveDayPlan: boolean,
    canGenerateNextDay: boolean,
    hasAllTripDayPlans: boolean,
    hasDepartureCity: boolean,
    selectedPlaceIds: string[],
    traceToolLabel: (tool?: string) => string,
    traceStatusLabel: (status?: string) => string,
    traceStatusColor: (status?: string) => AssistantStatusColor,
    onPlannerAction: (message: string, extraPayload?: Partial<PlannerChatSendPayload>) => void,
    onAssembleTrip: () => void,
    onSendChat: (message: string) => void,
}

interface AssistantAction {
    id: string,
    label: string,
    icon: ReactNode,
    disabledReason?: string,
    variant?: "outlined" | "contained",
    onClick: () => void,
}

const basePlanningPayload = (
    activeDayIndex: number,
    activeDayDate: string | undefined,
    selectedPlaceIds: string[],
    freeText: string,
): Partial<PlannerChatSendPayload> => ({
    planningMode: "REFINE_WITH_SELECTION",
    planningScope: "DAY_REFINE",
    targetDayIndex: activeDayIndex,
    targetDate: activeDayDate,
    interaction: {
        selectedPlaceIds,
        freeText,
    },
});

function disabledByCommonState({
    conversationActive,
    socketStatus,
    busy,
    isSnapshotPreview,
}: Pick<FloatingAiAssistantProps, "conversationActive" | "socketStatus" | "busy" | "isSnapshotPreview">) {
    if (!conversationActive) return "请先填写基础信息并开始规划";
    if (isSnapshotPreview) return "请切回当前版本后继续操作";
    if (busy) return "请等待当前生成完成";
    if (socketStatus !== "connected") return "正在连接 AI 服务";
    return undefined;
}

function ActionButton({action}: { action: AssistantAction }) {
    const disabled = Boolean(action.disabledReason);
    return (
        <Tooltip title={action.disabledReason || ""} placement="top" arrow disableHoverListener={!disabled}>
            <span>
                <Button
                    fullWidth
                    size="small"
                    variant={action.variant || "outlined"}
                    startIcon={action.icon}
                    disabled={disabled}
                    onClick={action.onClick}
                    sx={{
                        justifyContent: "flex-start",
                        minHeight: 38,
                        borderRadius: 1.5,
                        textAlign: "left",
                    }}
                >
                    {action.label}
                </Button>
            </span>
        </Tooltip>
    );
}

function progressEventKey(event: PlannerTraceEvent, index: number) {
    return event.eventId || `${event.type}-${event.tool || "planner"}-${event.createdAt || index}`;
}

export function FloatingAiAssistant({
    conversationActive,
    socketStatus,
    busy,
    busyLabel,
    chatMessages,
    progressEvents,
    currentProgressMessage,
    currentProgressStatus,
    isSnapshotPreview,
    activeDayIndex,
    activeDayDate,
    nextDayIndex,
    nextDayDate,
    hasActiveDayPlan,
    canGenerateNextDay,
    hasAllTripDayPlans,
    hasDepartureCity,
    selectedPlaceIds,
    traceToolLabel,
    traceStatusLabel,
    traceStatusColor,
    onPlannerAction,
    onAssembleTrip,
    onSendChat,
}: FloatingAiAssistantProps) {
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState("");
    const chatHistoryRef = useRef<HTMLDivElement | null>(null);
    const compact = useMediaQuery("(max-width: 640px)");
    const commonDisabledReason = disabledByCommonState({
        conversationActive,
        socketStatus,
        busy,
        isSnapshotPreview,
    });
    const displayedMessages = chatMessages;
    const visibleProgressEvents = progressEvents.slice(-5);
    const showProgress = busy || progressEvents.length > 0;
    const chatDisabledReason = commonDisabledReason;
    const assembleDisabledReason = !conversationActive
        ? "请先填写基础信息并开始规划"
        : isSnapshotPreview
            ? "请切回当前版本后继续操作"
            : busy
                ? "请等待当前生成完成"
                : !hasAllTripDayPlans
                    ? "请先补齐所有日计划"
                    : undefined;

    const sendPlannerAction = (message: string, extraPayload?: Partial<PlannerChatSendPayload>) => {
        onPlannerAction(message, extraPayload);
    };

    const submitChat = () => {
        const text = input.trim();
        if (!text || chatDisabledReason) return;
        onSendChat(text);
        setInput("");
    };

    const handleChatKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submitChat();
        }
    };

    useEffect(() => {
        if (!open || !chatHistoryRef.current) return;
        chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }, [chatMessages, open]);

    const sections = useMemo(() => {
        const generateDisabledReason = commonDisabledReason || (hasActiveDayPlan ? "当天已有计划，可使用优化当天" : undefined);
        const refineDisabledReason = commonDisabledReason || (!hasActiveDayPlan ? "请先生成当天行程" : undefined);
        const confirmDisabledReason = commonDisabledReason || (!hasActiveDayPlan ? "请先生成当天行程" : undefined);
        const nextDayDisabledReason = commonDisabledReason
            || (!hasActiveDayPlan ? "请先生成当天行程" : undefined)
            || (!canGenerateNextDay ? "已经是最后一天" : undefined);
        const ticketDisabledReason = commonDisabledReason || (!hasDepartureCity ? "请先填写出发城市" : undefined);

        const dayActions: AssistantAction[] = [
            {
                id: "generate-day",
                label: "生成当天",
                icon: <AutoAwesome/>,
                disabledReason: generateDisabledReason,
                onClick: () => sendPlannerAction(`请基于已确认天数和当前偏好，生成第 ${activeDayIndex} 天行程。`, {
                    planningMode: "ASK_MORE_OPTIONS",
                    planningScope: "DAY_PLAN",
                    targetDayIndex: activeDayIndex,
                    targetDate: activeDayDate,
                    interaction: {
                        selectedPlaceIds,
                        freeText: `生成第 ${activeDayIndex} 天`,
                    },
                }),
            },
            {
                id: "refine-day",
                label: "优化当天",
                icon: <AutoFixHigh/>,
                disabledReason: refineDisabledReason,
                onClick: () => sendPlannerAction(`请基于当前选中的地点和偏好，优化第 ${activeDayIndex} 天的行程。`, {
                    planningMode: "REFINE_WITH_SELECTION",
                    planningScope: "DAY_REFINE",
                    targetDayIndex: activeDayIndex,
                    targetDate: activeDayDate,
                    interaction: {
                        selectedPlaceIds,
                        freeText: `优化第 ${activeDayIndex} 天`,
                    },
                }),
            },
            {
                id: "confirm-day",
                label: "确认当天",
                icon: <TaskAlt/>,
                disabledReason: confirmDisabledReason,
                onClick: () => sendPlannerAction(`确认第 ${activeDayIndex} 天行程，并保留当前选中的地点。`, {
                    planningMode: "REFINE_WITH_SELECTION",
                    planningScope: "DAY_REFINE",
                    targetDayIndex: activeDayIndex,
                    targetDate: activeDayDate,
                    interaction: {
                        selectedPlaceIds,
                        freeText: `确认第 ${activeDayIndex} 天`,
                        confirmCurrentPlan: true,
                    },
                }),
            },
            {
                id: "next-day",
                label: "生成下一天",
                icon: <PlaylistAdd/>,
                disabledReason: nextDayDisabledReason,
                onClick: () => sendPlannerAction(`请基于已确认天数和当前偏好，生成第 ${nextDayIndex} 天行程。`, {
                    planningMode: "ASK_MORE_OPTIONS",
                    planningScope: "DAY_PLAN",
                    targetDayIndex: nextDayIndex,
                    targetDate: nextDayDate,
                    interaction: {
                        selectedPlaceIds,
                        freeText: `生成第 ${nextDayIndex} 天`,
                    },
                }),
            },
            {
                id: "assemble-trip",
                label: "汇总完整行程",
                icon: <TravelExplore/>,
                variant: "contained",
                disabledReason: assembleDisabledReason,
                onClick: onAssembleTrip,
            },
        ];

        const scenicPayload: Partial<PlannerChatSendPayload> = hasActiveDayPlan
            ? basePlanningPayload(
                activeDayIndex,
                activeDayDate,
                selectedPlaceIds,
                "推荐真实景点，优先使用 AMAP 景点数据，必须带图片，更新推荐卡和 Markdown，不生成预约链接。",
            )
            : {
                planningMode: "ASK_MORE_OPTIONS",
                planningScope: "DAY_PLAN",
                targetDayIndex: activeDayIndex,
                targetDate: activeDayDate,
                interaction: {
                    selectedPlaceIds,
                    freeText: "推荐真实景点，优先使用 AMAP 景点数据，必须带图片，更新推荐卡和 Markdown，不生成预约链接。",
                },
            };

        const smartActions: AssistantAction[] = [
            {
                id: "scenic",
                label: "推荐景点",
                icon: <TravelExplore/>,
                disabledReason: commonDisabledReason,
                onClick: () => sendPlannerAction(
                    "请推荐适合当前目的地和当天节奏的真实景点，优先使用 AMAP 景点数据，必须带图片，更新推荐卡和 Markdown，不生成预约链接。",
                    scenicPayload,
                ),
            },
            {
                id: "slower",
                label: "放慢节奏",
                icon: <Tune/>,
                disabledReason: refineDisabledReason,
                onClick: () => sendPlannerAction(
                    `请将第 ${activeDayIndex} 天行程调整得更轻松，减少赶路和密集景点，增加休息缓冲。`,
                    basePlanningPayload(activeDayIndex, activeDayDate, selectedPlaceIds, "放慢节奏"),
                ),
            },
            {
                id: "less-transfer",
                label: "减少换乘",
                icon: <SwapCalls/>,
                disabledReason: refineDisabledReason,
                onClick: () => sendPlannerAction(
                    `请优化第 ${activeDayIndex} 天交通衔接，减少跨区移动和换乘次数。`,
                    basePlanningPayload(activeDayIndex, activeDayDate, selectedPlaceIds, "减少换乘"),
                ),
            },
            {
                id: "food",
                label: "增加美食",
                icon: <Restaurant/>,
                disabledReason: refineDisabledReason,
                onClick: () => sendPlannerAction(
                    `请为第 ${activeDayIndex} 天补充餐饮和本地美食停留，并控制路线绕行。`,
                    basePlanningPayload(activeDayIndex, activeDayDate, selectedPlaceIds, "增加美食"),
                ),
            },
            {
                id: "family-rain",
                label: "亲子/雨天备选",
                icon: <ChildCare/>,
                disabledReason: refineDisabledReason,
                onClick: () => sendPlannerAction(
                    `请为第 ${activeDayIndex} 天增加适合家庭或天气变化的备选方案。`,
                    basePlanningPayload(activeDayIndex, activeDayDate, selectedPlaceIds, "增加亲子或雨天备选"),
                ),
            },
            {
                id: "reorder",
                label: "重排当天",
                icon: <AutoFixHigh/>,
                disabledReason: refineDisabledReason,
                onClick: () => sendPlannerAction(
                    `请基于当前地点重新排序第 ${activeDayIndex} 天路线，让动线更顺。`,
                    basePlanningPayload(activeDayIndex, activeDayDate, selectedPlaceIds, "重排当天路线"),
                ),
            },
        ];

        const bookingActions: AssistantAction[] = [
            {
                id: "hotel",
                label: "推荐酒店",
                icon: <Hotel/>,
                disabledReason: commonDisabledReason,
                onClick: () => sendPlannerAction(
                    "请基于当前目的地、日期、人数和住宿偏好，推荐可预订酒店，并保留可跳转的预订链接。",
                    basePlanningPayload(activeDayIndex, activeDayDate, selectedPlaceIds, "推荐可预订酒店"),
                ),
            },
            {
                id: "train",
                label: "推荐火车票",
                icon: <Train/>,
                disabledReason: ticketDisabledReason,
                onClick: () => sendPlannerAction(
                    "请基于出发城市、目的地和出行日期，推荐可预订火车票，并保留可跳转的预订链接。",
                    basePlanningPayload(activeDayIndex, activeDayDate, selectedPlaceIds, "推荐可预订火车票"),
                ),
            },
            {
                id: "flight",
                label: "推荐机票",
                icon: <Flight/>,
                disabledReason: ticketDisabledReason,
                onClick: () => sendPlannerAction(
                    "请基于出发城市、目的地和出行日期，推荐可预订机票，并保留可跳转的预订链接。",
                    basePlanningPayload(activeDayIndex, activeDayDate, selectedPlaceIds, "推荐可预订机票"),
                ),
            },
        ];

        return [
            {title: "行程推进", actions: dayActions},
            {title: "智能修改", actions: smartActions},
            {title: "票务推荐", actions: bookingActions},
        ];
    }, [
        activeDayDate,
        activeDayIndex,
        assembleDisabledReason,
        canGenerateNextDay,
        commonDisabledReason,
        hasActiveDayPlan,
        hasDepartureCity,
        nextDayDate,
        nextDayIndex,
        onAssembleTrip,
        onPlannerAction,
        selectedPlaceIds,
    ]);

    return (
        <Box
            sx={{
                position: "fixed",
                right: {xs: 12, sm: 24},
                bottom: {xs: 12, sm: 24},
                zIndex: theme => theme.zIndex.modal - 1,
            }}
        >
            {!open ? (
                <Tooltip title="AI 助手" placement="left" arrow>
                    <Fab
                        color="primary"
                        onClick={() => setOpen(true)}
                        sx={{
                            boxShadow: 5,
                            bgcolor: "#19857b",
                            color: "#fff",
                            "&:hover": {bgcolor: "#146c64"},
                        }}
                    >
                        {busy ? <CircularProgress size={24} color="inherit"/> : <AutoAwesome/>}
                    </Fab>
                </Tooltip>
            ) : (
                <Paper
                    elevation={8}
                    sx={{
                        width: compact ? "calc(100vw - 24px)" : 420,
                        maxHeight: compact ? "calc(100dvh - 48px)" : "72vh",
                        overflow: "hidden",
                        borderRadius: 2,
                        border: "1px solid",
                        borderColor: "divider",
                        display: "flex",
                        flexDirection: "column",
                        bgcolor: "background.paper",
                    }}
                >
                    <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#19857b] text-white">
                                {busy ? <CircularProgress size={18} color="inherit"/> : <AutoAwesome fontSize="small"/>}
                            </span>
                            <div className="min-w-0">
                                <Typography variant="subtitle1" className="truncate">AI 旅行助手</Typography>
                                <Typography variant="caption" color="text.secondary" className="block truncate">
                                    {busy ? busyLabel : conversationActive ? `第 ${activeDayIndex} 天 · ${socketStatus}` : "请先开始规划"}
                                </Typography>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            {busy && <Chip size="small" label="生成中" color="primary" variant="outlined"/>}
                            <Tooltip title="收起">
                                <IconButton size="small" onClick={() => setOpen(false)}>
                                    <ExpandMore/>
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="关闭">
                                <IconButton size="small" onClick={() => setOpen(false)}>
                                    <Close/>
                                </IconButton>
                            </Tooltip>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                        {showProgress &&
                            <div className="mb-4 rounded-md border border-gray-200 bg-[#fbfcff] px-3 py-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <Typography variant="caption" color="text.secondary" className="mb-1 block font-semibold">
                                            生成进度
                                        </Typography>
                                        <Typography variant="body2" className="truncate text-gray-800">
                                            {currentProgressMessage || busyLabel}
                                        </Typography>
                                    </div>
                                    <Chip
                                        size="small"
                                        color={traceStatusColor(currentProgressStatus)}
                                        variant="outlined"
                                        label={traceStatusLabel(currentProgressStatus)}
                                    />
                                </div>
                                {busy &&
                                    <Box sx={{mt: 1.25}}>
                                        <LinearProgress/>
                                    </Box>
                                }
                                {visibleProgressEvents.length > 0 &&
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {visibleProgressEvents.map((event, index) => (
                                            <Chip
                                                key={progressEventKey(event, index)}
                                                size="small"
                                                variant="outlined"
                                                color={traceStatusColor(event.status)}
                                                label={`${traceToolLabel(event.tool)} · ${traceStatusLabel(event.status)}`}
                                            />
                                        ))}
                                    </div>
                                }
                            </div>
                        }

                        {sections.map(section => (
                            <div key={section.title} className="mb-4 last:mb-0">
                                <Typography variant="caption" color="text.secondary" className="mb-2 block font-semibold">
                                    {section.title}
                                </Typography>
                                <div className="grid grid-cols-2 gap-2">
                                    {section.actions.map(action => (
                                        <ActionButton key={action.id} action={action}/>
                                    ))}
                                </div>
                            </div>
                        ))}

                        <div className="mt-4">
                            <Typography variant="caption" color="text.secondary" className="mb-2 block font-semibold">
                                对话历史
                            </Typography>
                            {displayedMessages.length === 0 ? (
                                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-4 text-center">
                                    <Typography variant="body2" color="text.secondary">
                                        开始规划后，AI 的回复和你的调整会显示在这里。
                                    </Typography>
                                </div>
                            ) : (
                                <div
                                    ref={chatHistoryRef}
                                    className="max-h-[240px] space-y-2 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 px-3 py-3"
                                >
                                    {displayedMessages.map(message => (
                                        <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                                            <div
                                                className={`max-w-[86%] rounded-lg px-3 py-2 text-sm leading-6 ${
                                                    message.role === "user"
                                                        ? "bg-[#19857b] text-white"
                                                        : message.role === "system"
                                                            ? "bg-gray-100 text-gray-600"
                                                            : "bg-[#f4f6fb] text-gray-800"
                                                }`}
                                            >
                                                <pre className="whitespace-pre-wrap break-words font-sans">{message.text || (message.streaming ? "AI 正在组织回复..." : "")}{message.streaming ? "|" : ""}</pre>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <Divider/>

                    <div className="shrink-0 px-4 py-3">
                        <Typography variant="caption" color="text.secondary" className="mb-2 block font-semibold">
                            继续对话
                        </Typography>
                        <div className="flex gap-2">
                            <TextField
                                value={input}
                                onChange={event => setInput(event.target.value)}
                                onKeyDown={handleChatKeyDown}
                                disabled={Boolean(chatDisabledReason)}
                                placeholder={chatDisabledReason || "告诉 AI 你想怎么调整行程..."}
                                size="small"
                                fullWidth
                                multiline
                                maxRows={3}
                            />
                            <Tooltip title={chatDisabledReason || ""} arrow disableHoverListener={!chatDisabledReason}>
                                <span>
                                    <IconButton
                                        color="primary"
                                        disabled={!input.trim() || Boolean(chatDisabledReason)}
                                        onClick={submitChat}
                                        sx={{
                                            height: 40,
                                            width: 40,
                                            bgcolor: "#e9f1ff",
                                            "&:hover": {bgcolor: "#dce8ff"},
                                        }}
                                    >
                                        <Send/>
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </div>
                    </div>
                </Paper>
            )}
        </Box>
    );
}
