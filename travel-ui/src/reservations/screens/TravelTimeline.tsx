import React, {useEffect, useMemo, useState} from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    Divider,
    LinearProgress,
    Paper,
} from "@mui/material";
import {
    ArrowForward,
    EventNote,
    FlightTakeoff,
    Hotel,
    Luggage,
    Refresh,
    Train,
    Visibility,
} from "@mui/icons-material";
import {Link} from "react-router-dom";
import {ApiRequests, ReservationResponse} from "../../core/apiConfig";
import {getCurrentUserId, getCurrentUserMode} from "../../core/currentUser";
import {useAuthSession} from "../../core/useAuthSession";
import {getEffectiveReservationStatus} from "../orderStatus";

type TimelineKind = "FLIGHT" | "TRAIN" | "HOTEL" | "OTHER";

type TravelTimelineItem = {
    id: string;
    reservation: ReservationResponse;
    kind: TimelineKind;
    startDate: Date;
    endDate?: Date | null;
    dayKey: string;
};

type TravelTimelineGroup = {
    dayKey: string;
    dayDate: Date;
    title: string;
    subtitle: string;
    items: TravelTimelineItem[];
};

const kindMeta: Record<TimelineKind, {
    label: string;
    accent: string;
    softClass: string;
    icon: React.ReactNode;
}> = {
    FLIGHT: {
        label: "航班",
        accent: "#2563eb",
        softClass: "bg-blue-50 text-blue-700",
        icon: <FlightTakeoff/>,
    },
    TRAIN: {
        label: "火车",
        accent: "#0f766e",
        softClass: "bg-emerald-50 text-emerald-700",
        icon: <Train/>,
    },
    HOTEL: {
        label: "酒店",
        accent: "#7c3aed",
        softClass: "bg-violet-50 text-violet-700",
        icon: <Hotel/>,
    },
    OTHER: {
        label: "行程",
        accent: "#475569",
        softClass: "bg-slate-100 text-slate-700",
        icon: <Luggage/>,
    },
};

const getTimelineKind = (reservation: ReservationResponse): TimelineKind => {
    if (reservation.bookingType === "FLIGHT") return "FLIGHT";
    if (reservation.bookingType === "TRAIN") return "TRAIN";
    if (reservation.bookingType === "HOTEL") return "HOTEL";
    return "OTHER";
};

const parseTripDate = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const pad = (value: number) => String(value).padStart(2, "0");

const getDayKey = (date: Date) => {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const formatDayTitle = (date: Date) => {
    return date.toLocaleDateString("zh-CN", {
        month: "long",
        day: "numeric",
        weekday: "short",
    });
};

const formatShortDate = (date?: Date | null) => {
    if (!date) return "-";
    return date.toLocaleDateString("zh-CN", {
        month: "numeric",
        day: "numeric",
    });
};

const formatTimelineTime = (date?: Date | null, fallback = "待定") => {
    if (!date) return fallback;
    return date.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
};

const formatDateTime = (date?: Date | null) => {
    if (!date) return "-";
    return date.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
};

const getTravelerCount = (reservation: ReservationResponse) => {
    return reservation.adultsQuantity
        + reservation.childrenUnder18Quantity
        + reservation.childrenUnder10Quantity
        + reservation.childrenUnder3Quantity;
};

const getTimelineStartDate = (reservation: ReservationResponse) => {
    return parseTripDate(reservation.hotelTimeFrom)
        ?? parseTripDate(reservation.paidAt)
        ?? parseTripDate(reservation.createdAt)
        ?? new Date(0);
};

const getTimelineEndDate = (reservation: ReservationResponse) => {
    return parseTripDate(reservation.hotelTimeTo);
};

const isTicketReservation = (reservation: ReservationResponse) => {
    return reservation.bookingType === "FLIGHT" || reservation.bookingType === "TRAIN";
};

const isTimelineReservationActive = (
    reservation: ReservationResponse,
    now = new Date(),
) => {
    if (getEffectiveReservationStatus(reservation) !== "PAID") {
        return false;
    }

    const startDate = getTimelineStartDate(reservation);
    const endDate = getTimelineEndDate(reservation);

    if (isTicketReservation(reservation)) {
        return startDate.getTime() > now.getTime();
    }

    if (reservation.bookingType === "HOTEL") {
        return (endDate ?? startDate).getTime() >= now.getTime();
    }

    return (endDate ?? startDate).getTime() >= now.getTime();
};

const getItemTitle = (reservation: ReservationResponse) => {
    if (reservation.bookingType === "HOTEL") {
        return reservation.title || reservation.provider || "酒店入住";
    }

    if (reservation.routeFrom || reservation.routeTo) {
        return `${reservation.routeFrom || "出发地"} → ${reservation.routeTo || "目的地"}`;
    }

    return reservation.title || "行程安排";
};

const getItemSubtitle = (reservation: ReservationResponse) => {
    if (reservation.bookingType === "HOTEL") {
        return reservation.provider || "酒店订单";
    }

    return [
        reservation.provider,
        reservation.bookingCode,
    ].filter(Boolean).join(" · ") || "票务订单";
};

const getGroupSubtitle = (item: TravelTimelineItem) => {
    const reservation = item.reservation;
    if (reservation.bookingType === "HOTEL") {
        return reservation.title ? `入住 ${reservation.title}` : "酒店入住";
    }
    if (reservation.routeTo) {
        return `前往 ${reservation.routeTo}`;
    }
    return "已确认行程";
};

const buildTimelineItems = (
    reservations: ReservationResponse[],
    now = new Date(),
): TravelTimelineItem[] => {
    return reservations
        .filter(reservation => isTimelineReservationActive(reservation, now))
        .map(reservation => {
            const startDate = getTimelineStartDate(reservation);
            return {
                id: reservation.id,
                reservation,
                kind: getTimelineKind(reservation),
                startDate,
                endDate: getTimelineEndDate(reservation),
                dayKey: getDayKey(startDate),
            };
        })
        .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
};

const buildTimelineGroups = (items: TravelTimelineItem[]): TravelTimelineGroup[] => {
    const groupMap = new Map<string, TravelTimelineGroup>();

    items.forEach(item => {
        const group = groupMap.get(item.dayKey);
        if (group) {
            group.items.push(item);
            group.subtitle = group.subtitle || getGroupSubtitle(item);
            return;
        }

        groupMap.set(item.dayKey, {
            dayKey: item.dayKey,
            dayDate: item.startDate,
            title: formatDayTitle(item.startDate),
            subtitle: getGroupSubtitle(item),
            items: [item],
        });
    });

    return Array.from(groupMap.values()).sort(
        (left, right) => left.dayDate.getTime() - right.dayDate.getTime(),
    );
};

const TimelineCard = ({item}: { item: TravelTimelineItem }) => {
    const reservation = item.reservation;
    const meta = kindMeta[item.kind];
    const isHotel = item.kind === "HOTEL";
    const travelerCount = getTravelerCount(reservation);
    const isHotelCheckedIn = isHotel && item.startDate.getTime() <= Date.now();

    return (
        <Paper elevation={0} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${meta.softClass}`}
                            style={{color: meta.accent}}
                        >
                            {meta.icon}
                        </span>
                        <Chip size="small" label={meta.label} sx={{backgroundColor: "#f8fafc"}}/>
                        {reservation.bookingCode && <Chip size="small" variant="outlined" label={reservation.bookingCode}/>}
                        <Chip size="small" color="success" label="已支付"/>
                        {isHotel && <Chip size="small" color={isHotelCheckedIn ? "info" : "default"} label={isHotelCheckedIn ? "入住中" : "待入住"}/>}
                    </div>

                    <h3 className="mt-4 truncate text-xl font-bold text-slate-950">
                        {getItemTitle(reservation)}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">{getItemSubtitle(reservation)}</p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        {isHotel ? (
                            <>
                                <div className="rounded-xl bg-slate-50 px-4 py-3">
                                    <p className="text-xs text-slate-500">入住</p>
                                    <p className="mt-1 text-lg font-semibold text-slate-900">{formatShortDate(item.startDate)}</p>
                                </div>
                                <div className="rounded-xl bg-slate-50 px-4 py-3">
                                    <p className="text-xs text-slate-500">离店</p>
                                    <p className="mt-1 text-lg font-semibold text-slate-900">{formatShortDate(item.endDate)}</p>
                                </div>
                                <div className="rounded-xl bg-slate-50 px-4 py-3">
                                    <p className="text-xs text-slate-500">入住人</p>
                                    <p className="mt-1 text-lg font-semibold text-slate-900">{travelerCount || 1} 人</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="rounded-xl bg-slate-50 px-4 py-3">
                                    <p className="text-xs text-slate-500">出发</p>
                                    <p className="mt-1 text-2xl font-bold" style={{color: meta.accent}}>
                                        {formatTimelineTime(item.startDate)}
                                    </p>
                                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">{reservation.routeFrom || "出发地"}</p>
                                </div>
                                <div className="flex items-center justify-center text-slate-400">
                                    <ArrowForward/>
                                </div>
                                <div className="rounded-xl bg-slate-50 px-4 py-3">
                                    <p className="text-xs text-slate-500">到达</p>
                                    <p className="mt-1 text-2xl font-bold text-slate-950">
                                        {formatTimelineTime(item.endDate)}
                                    </p>
                                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">{reservation.routeTo || "目的地"}</p>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex min-w-[160px] flex-col gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
                    <div>
                        <p className="text-slate-500">订单金额</p>
                        <p className="mt-1 text-2xl font-bold text-orange-500">
                            ¥{Math.ceil(reservation.price).toLocaleString()}
                        </p>
                    </div>
                    <Divider/>
                    <p className="text-xs text-slate-500">
                        {isHotel
                            ? `${formatShortDate(item.startDate)} - ${formatShortDate(item.endDate)}`
                            : `${formatDateTime(item.startDate)} - ${formatDateTime(item.endDate)}`}
                    </p>
                    <Button
                        component={Link}
                        to={`/reservations/${reservation.id}`}
                        variant="outlined"
                        size="small"
                        startIcon={<Visibility/>}
                        sx={{borderRadius: 2}}
                    >
                        查看订单
                    </Button>
                </div>
            </div>
        </Paper>
    );
};

const TravelTimeline = () => {
    const session = useAuthSession();
    const [reservations, setReservations] = useState<ReservationResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [currentTime, setCurrentTime] = useState(() => new Date());

    const userId = getCurrentUserId();
    const userMode = getCurrentUserMode();

    const loadReservations = async () => {
        setLoading(true);
        setError(false);
        try {
            if (!session) throw new Error("Authentication required");
            const response = await ApiRequests.getReservationsForUser(session.token, userId);
            setReservations(response.data);
        } catch (e) {
            console.log(e);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReservations().then(r => r);
    }, [session?.token, userId]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setCurrentTime(new Date());
        }, 60 * 1000);
        return () => window.clearInterval(timer);
    }, []);

    const timelineItems = useMemo(() => buildTimelineItems(reservations, currentTime), [reservations, currentTime]);
    const timelineGroups = useMemo(() => buildTimelineGroups(timelineItems), [timelineItems]);
    const hiddenOrderCount = reservations.length - timelineItems.length;

    return (
        <main className="min-h-screen bg-slate-50 px-6 py-10 lg:px-24 xl:px-48">
            <section className="overflow-hidden rounded-3xl bg-gradient-to-r from-sky-600 via-cyan-500 to-emerald-500 p-8 text-white shadow-lg">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="flex items-center gap-2 text-sm font-semibold text-white/80">
                            <EventNote/> 我的行程
                        </p>
                        <h1 className="mt-4 text-4xl font-black">已确认行程时间线</h1>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/85">
                            自动整合已支付且尚未开始的火车票、机票，以及未离店的酒店订单；订单退款、取消或行程结束后，会从这里移除。
                        </p>
                    </div>
                    <div className="rounded-2xl bg-white/15 px-5 py-4 backdrop-blur">
                        <p className="text-sm text-white/75">当前展示</p>
                        <p className="mt-1 text-3xl font-bold">{timelineItems.length} 项</p>
                        <p className="mt-1 text-xs text-white/70">
                            {userMode === "GUEST" ? "游客行程" : "账号行程"}
                        </p>
                    </div>
                </div>
            </section>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">
                    仅显示接下来的有效行程；待支付、已超时、已退款、已取消、票务已出发或酒店已离店的订单不会进入时间线。
                    {hiddenOrderCount > 0 ? ` 已隐藏 ${hiddenOrderCount} 个不在当前行程中的订单。` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button component={Link} to="/reservations" variant="outlined">
                        我的预订
                    </Button>
                    <Button variant="contained" startIcon={<Refresh/>} onClick={loadReservations} disabled={loading}>
                        刷新行程
                    </Button>
                </div>
            </div>

            {loading && <Box sx={{height: 5}} className="mt-4"><LinearProgress/></Box>}

            {error &&
                <Alert severity="error" className="mt-4">
                    读取行程失败，请确认后端服务已启动。
                </Alert>
            }

            {!loading && !error && timelineGroups.length === 0 &&
                <Paper elevation={0} className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-12 text-center">
                    <EventNote sx={{fontSize: 54, color: "#94a3b8"}}/>
                    <h2 className="mt-4 text-2xl font-bold text-slate-900">暂无接下来的行程</h2>
                    <p className="mt-2 text-slate-500">
                        完成票务或酒店支付后，未开始的票务和未离店的酒店会出现在这里；出发、离店或退款完成后会自动移除。
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                        <Button component={Link} to="/reservations/trains" variant="contained">订火车票</Button>
                        <Button component={Link} to="/reservations/flights" variant="outlined">订机票</Button>
                        <Button component={Link} to="/reservations/hotels" variant="outlined">订酒店</Button>
                    </div>
                </Paper>
            }

            {timelineGroups.length > 0 &&
                <section className="mt-8">
                    <div className="relative grid gap-8">
                        {timelineGroups.map((group, groupIndex) => (
                            <div key={group.dayKey} className="relative grid gap-4 pl-10">
                                <div className="absolute left-[15px] top-8 h-[calc(100%+2rem)] w-px bg-slate-200"/>
                                <div
                                    className="absolute left-0 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border-4 border-slate-50 bg-white text-slate-400 shadow-sm"
                                >
                                    <span className="h-3 w-3 rounded-full bg-cyan-500"/>
                                </div>
                                <div className="flex flex-wrap items-baseline gap-3">
                                    <h2 className="text-2xl font-black text-slate-950">{group.title}</h2>
                                    <p className="text-sm font-semibold text-slate-500">{group.subtitle}</p>
                                </div>
                                <div className="grid gap-4">
                                    {group.items.map(item => (
                                        <TimelineCard key={item.id} item={item}/>
                                    ))}
                                </div>
                                {groupIndex === timelineGroups.length - 1 &&
                                    <div className="absolute left-[15px] top-8 h-full w-px bg-slate-50"/>
                                }
                            </div>
                        ))}
                    </div>
                </section>
            }
        </main>
    );
};

export default TravelTimeline;
