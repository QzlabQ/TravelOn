import React, {useEffect, useMemo, useRef, useState} from "react";
import {Alert, Box, Button, Chip, LinearProgress, Rating, Snackbar} from "@mui/material";
import {
    ArrowBack,
    Bed,
    CalendarMonth,
    CheckCircle,
    Hotel as HotelIcon,
    LocationOn,
    Payments,
    People,
    Star
} from "@mui/icons-material";
import {Link, useLocation, useNavigate, useParams, useSearchParams} from "react-router-dom";
import {
    ApiRequests,
    BookingPersonPayload,
    CommunitySummaryResponse,
    GetOffersBySearchQueryOffer,
    HotelDetailsResponse,
    HotelRoomConfiguration
} from "../../core/apiConfig";
import TravelerSelector from "../../account/components/TravelerSelector";
import {addNotification, getCurrentUserId} from "../../core/currentUser";
import {formatDate} from "../../core/utils";
import CheckoutConfirmDialog from "../components/CheckoutConfirmDialog";
import {useAuthSession} from "../../core/useAuthSession";
import {validateStayDates} from "../../core/validation";
import {formatCommunityTime} from "../../community/components/communityLabels";

const today = new Date();
const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

type HotelDetailsState = {
    offer?: GetOffersBySearchQueryOffer,
    dateFrom?: string,
    dateTo?: string,
    adults?: number,
    roomType?: string,
};

const HotelDetails = () => {
    const {hotelId = ""} = useParams();
    const numericHotelId = Number(hotelId);
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const navigateTimerRef = useRef<number | null>(null);
    const session = useAuthSession();
    const isAuthenticated = Boolean(session);
    const state = (location.state ?? {}) as HotelDetailsState;

    const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? state.dateFrom ?? formatDate(today));
    const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? state.dateTo ?? formatDate(tomorrow));
    const [details, setDetails] = useState<HotelDetailsResponse | null>(null);
    const [communitySummary, setCommunitySummary] = useState<CommunitySummaryResponse | null>(null);
    const [selectedConfiguration, setSelectedConfiguration] = useState<HotelRoomConfiguration | null>(null);
    const [selectedTravelers, setSelectedTravelers] = useState<BookingPersonPayload[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [bookingMessage, setBookingMessage] = useState("");
    const [bookingError, setBookingError] = useState(false);
    const [toastOpen, setToastOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const [toastError, setToastError] = useState(false);
    const [reservationId, setReservationId] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [checkoutConfirmOpen, setCheckoutConfirmOpen] = useState(false);

    const adultCount = Math.max(1, selectedTravelers.filter(traveler => traveler.travelerType !== "CHILD").length || state.adults || Number(searchParams.get("adults")) || 2);
    const childCount = selectedTravelers.filter(traveler => traveler.travelerType === "CHILD").length;
    const guestCount = Math.max(1, selectedTravelers.length || adultCount + childCount);
    const nights = useMemo(() => {
        const start = new Date(dateFrom);
        const end = new Date(dateTo);
        const diff = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
        return Number.isFinite(diff) ? Math.max(1, diff) : 1;
    }, [dateFrom, dateTo]);
    const stayDateError = validateStayDates(dateFrom, dateTo);

    const heroPhoto = details?.photos?.[0] || state.offer?.imageUrl || "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=80";
    const displayName = details?.hotelName || state.offer?.hotelName || "酒店详情";
    const displayRating = communitySummary && communitySummary.reviewCount > 0
        ? communitySummary.averageRating
        : details?.rating ?? state.offer?.rating ?? 4.5;
    const reviewCount = communitySummary?.reviewCount ?? 0;
    const latestReviews = communitySummary?.latestReviews ?? [];
    const selectedRoomNames = selectedConfiguration?.rooms.map(room => room.name).join(" + ") || state.roomType || "标准房";
    const totalPrice = selectedConfiguration ? Math.ceil(selectedConfiguration.pricePerAdult * guestCount * nights) : 0;

    const clearAutoNavigate = () => {
        if (navigateTimerRef.current) {
            window.clearTimeout(navigateTimerRef.current);
            navigateTimerRef.current = null;
        }
    };

    const showToast = (message: string, errorToast = false) => {
        setToastError(errorToast);
        setToastMessage(message);
        setToastOpen(true);
    };

    useEffect(() => clearAutoNavigate, []);

    useEffect(() => {
        if (!hotelId || Number.isNaN(numericHotelId) || stayDateError) return;

        setLoading(true);
        setError(false);
        ApiRequests.getHotelDetails(numericHotelId, {
            dateFrom,
            dateTo,
            adults: adultCount,
            childrenUnder18: childCount,
            childrenUnder10: 0,
            childrenUnder3: 0,
        })
            .then(response => {
                setDetails(response.data);
                setSelectedConfiguration(current => {
                    if (current && response.data.roomsConfigurations.some(item => roomConfigKey(item) === roomConfigKey(current))) {
                        return response.data.roomsConfigurations.find(item => roomConfigKey(item) === roomConfigKey(current)) ?? null;
                    }
                    return response.data.roomsConfigurations[0] ?? null;
                });
            })
            .catch(e => {
                console.log(e);
                setError(true);
            })
            .finally(() => setLoading(false));
    }, [hotelId, numericHotelId, dateFrom, dateTo, adultCount, childCount, stayDateError]);

    useEffect(() => {
        if (!hotelId) {
            setCommunitySummary(null);
            return;
        }

        ApiRequests.getCommunitySummary({
            targetType: "HOTEL",
            targetId: String(numericHotelId),
        })
            .then(response => setCommunitySummary(response.data))
            .catch(() => setCommunitySummary(null));
    }, [hotelId, numericHotelId]);

    const openCheckoutConfirm = () => {
        if (!isAuthenticated) {
            setBookingError(true);
            setBookingMessage("请先登录账户，再选择房型并提交订单。");
            showToast("请先登录后再提交订单", true);
            return;
        }
        if (stayDateError) {
            setBookingError(true);
            setBookingMessage(stayDateError);
            showToast(stayDateError, true);
            return;
        }
        if (!details || !selectedConfiguration) {
            setBookingError(true);
            setBookingMessage("请先选择可预订房型。");
            showToast("请先选择可预订房型", true);
            return;
        }
        if (selectedTravelers.length === 0) {
            setBookingError(true);
            setBookingMessage("请先选择或填写至少一位入住人。");
            showToast("请先选择或填写入住人", true);
            return;
        }

        setCheckoutConfirmOpen(true);
    };

    const submitReservation = async () => {
        if (!isAuthenticated || !details || !selectedConfiguration || selectedTravelers.length === 0) {
            setCheckoutConfirmOpen(false);
            return;
        }
        if (stayDateError) {
            setBookingError(true);
            setBookingMessage(stayDateError);
            showToast(stayDateError, true);
            return;
        }

        setSubmitting(true);
        setBookingError(false);
        setBookingMessage("");
        setCheckoutConfirmOpen(false);
        try {
            const response = await ApiRequests.createHotelReservation({
                userId: getCurrentUserId(),
                hotelId: details.hotelId,
                hotelName: details.hotelName,
                dateFrom,
                dateTo,
                adultsQuantity: selectedTravelers.filter(traveler => traveler.travelerType !== "CHILD").length,
                childrenUnder3Quantity: 0,
                childrenUnder10Quantity: 0,
                childrenUnder18Quantity: selectedTravelers.filter(traveler => traveler.travelerType === "CHILD").length,
                price: totalPrice,
                roomName: selectedRoomNames,
                travelers: selectedTravelers,
            });
            setReservationId(response.data.id);
            addNotification({
                type: "ORDER_CREATED",
                title: "酒店订单已创建",
                message: `${details.hotelName} 已创建待支付订单，请在 30 分钟内完成支付。`,
                reservationId: response.data.id,
            });
            setBookingMessage(`已创建酒店预订 ${response.data.id}，请在订单详情中完成支付。`);
            showToast("订单提交成功，即将进入订单详情");
            clearAutoNavigate();
            navigateTimerRef.current = window.setTimeout(() => {
                navigate(`/reservations/${response.data.id}#payment-countdown`);
            }, 2000);
        } catch (e) {
            console.log(e);
            setBookingError(true);
            setBookingMessage("创建酒店预订失败，请检查后端服务或入住日期。");
            showToast("提交失败，请稍后再试", true);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 px-8 py-8">
            <Snackbar
                open={toastOpen}
                autoHideDuration={1800}
                onClose={() => setToastOpen(false)}
                anchorOrigin={{vertical: "top", horizontal: "center"}}
                sx={{mt: 2, zIndex: theme => theme.zIndex.modal + 1}}
            >
                <Alert
                    severity={toastError ? "error" : "success"}
                    onClose={() => setToastOpen(false)}
                    action={!toastError && reservationId ?
                        <Button
                            component={Link}
                            to={`/reservations/${reservationId}#payment-countdown`}
                            color="inherit"
                            size="small"
                            onClick={clearAutoNavigate}
                        >
                            查看订单
                        </Button>
                        : undefined
                    }
                    sx={{minWidth: 320, borderRadius: 2, boxShadow: 6, fontSize: 16, alignItems: "center"}}
                >
                    {toastMessage}
                </Alert>
            </Snackbar>

            <div className="mb-5 flex items-center justify-between">
                <Button component={Link} to="/reservations/hotels" startIcon={<ArrowBack/>} variant="outlined" sx={{borderRadius: 2}}>
                    返回酒店列表
                </Button>
                <Chip icon={<HotelIcon/>} label="酒店详情" sx={{backgroundColor: "#eff6ff", color: "#2563eb"}}/>
            </div>

            {loading && <Box sx={{height: 5}} className="mb-4"><LinearProgress/></Box>}
            {error && <Alert severity="warning" className="mb-4">酒店详情暂时不可用，请确认酒店服务已启动。</Alert>}
            {stayDateError && <Alert severity="warning" className="mb-4">{stayDateError}</Alert>}
            {!isAuthenticated && <Alert severity="info" className="mb-4">未登录时可以查看酒店价格、房型和评价；登录后才能选择房型、填写入住人并提交订单。</Alert>}
            {bookingMessage && <Alert severity={bookingError ? "error" : "success"} className="mb-4" action={reservationId ? <Button component={Link} to={`/reservations/${reservationId}#payment-countdown`} color="inherit" size="small">订单详情</Button> : undefined}>{bookingMessage}</Alert>}

            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="grid min-h-[360px] grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
                    <div className="relative">
                        <img src={heroPhoto} alt={displayName} className="absolute inset-0 h-full w-full object-cover"/>
                    </div>
                    <div className="flex flex-col justify-end p-8">
                        <div className="flex flex-wrap gap-2">
                            <Chip size="small" icon={<CheckCircle/>} label="立即确认"/>
                            <Chip size="small" icon={<Payments/>} label="到店前可取消"/>
                        </div>
                        <h1 className="mt-5 text-4xl font-bold text-slate-950">{displayName}</h1>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                            <span className="inline-flex items-center gap-1"><Star className="text-amber-500" fontSize="small"/>{displayRating.toFixed(1)} 分</span>
                            {details?.location &&
                                <span className="inline-flex items-center gap-1"><LocationOn fontSize="small"/>{details.location.region}，{details.location.country}</span>
                            }
                        </div>
                        <p className="mt-5 text-sm leading-7 text-slate-600">{details?.description || state.offer?.description || "酒店位置便利，适合休闲旅行和家庭出游。"}</p>
                    </div>
                </div>
            </section>

            <div className="mt-6 grid grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
                <main className="space-y-6">
                    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-4">
                            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-950"><CalendarMonth/> 入住信息</h2>
                            <span className="text-sm text-slate-500">{nights} 晚 · {guestCount} 人</span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-4">
                            <label className="text-sm font-semibold text-slate-700">
                                入住日期
                                <input className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)}/>
                            </label>
                            <label className="text-sm font-semibold text-slate-700">
                                离店日期
                                <input className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)}/>
                            </label>
                        </div>
                        <p className={`mt-3 text-xs ${stayDateError ? "text-red-500" : "text-slate-500"}`}>
                            {stayDateError || "入住日期不能早于今天，离店日期需晚于入住日期。"}
                        </p>
                    </section>

                    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-4">
                            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-950"><Bed/> 可订房型</h2>
                            <span className="text-sm text-slate-500">{details?.roomsConfigurations?.length ?? 0} 种组合</span>
                        </div>
                        <div className="mt-4 space-y-3">
                            {details?.roomsConfigurations.map((configuration, index) => (
                                <RoomConfigurationCard
                                    key={roomConfigKey(configuration)}
                                    configuration={configuration}
                                    index={index}
                                    selected={isAuthenticated && roomConfigKey(configuration) === roomConfigKey(selectedConfiguration)}
                                    nights={nights}
                                    guestCount={guestCount}
                                    canSelect={isAuthenticated}
                                    onSelect={() => setSelectedConfiguration(configuration)}
                                />
                            ))}
                            {details && details.roomsConfigurations.length === 0 &&
                                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-slate-500">
                                    当前日期没有可用房型，请换一个日期或减少入住人数。
                                </div>
                            }
                        </div>
                    </section>

                    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-4">
                            <h2 className="text-xl font-bold text-slate-950">住客评价</h2>
                            <Chip size="small" label={reviewCount > 0 ? `${reviewCount} 条社区评价` : "暂无社区评价"}/>
                        </div>
                        <div className="mt-4 grid grid-cols-[180px_1fr] gap-5">
                            <div className="rounded-lg bg-blue-50 p-4 text-center">
                                <p className="text-4xl font-bold text-blue-700">{displayRating.toFixed(1)}</p>
                                <Rating value={displayRating} precision={0.1} readOnly size="small"/>
                                <p className="mt-2 text-sm text-slate-500">
                                    {reviewCount > 0 ? "来自社区酒店评价" : "暂无社区评价，显示酒店基础评分"}
                                </p>
                            </div>
                            <div className="space-y-3">
                                {latestReviews.map(review => (
                                    <div key={review.id} className="rounded-lg bg-slate-50 p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="font-semibold text-slate-900">{review.authorName}</p>
                                                <p className="mt-1 text-xs text-slate-500">{formatCommunityTime(review.createdAt)}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Rating value={review.rating} readOnly size="small"/>
                                                <span className="text-sm font-semibold text-slate-700">{review.rating}.0</span>
                                            </div>
                                        </div>
                                        <p className="mt-3 text-sm leading-6 text-slate-600">{review.content}</p>
                                    </div>
                                ))}
                                {latestReviews.length === 0 &&
                                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-sm text-slate-500">
                                        社区中还没有这家酒店的评论。
                                    </div>
                                }
                            </div>
                        </div>
                    </section>
                </main>

                <aside className="sticky top-24 space-y-5">
                    <TravelerSelector title="选择入住人" onChange={setSelectedTravelers}/>

                    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950"><People/> 订单填写</h2>
                        <div className="mt-4 rounded-lg bg-slate-50 p-3">
                            <p className="text-sm font-semibold text-slate-900">{displayName}</p>
                            <p className="mt-1 text-sm text-slate-600">{dateFrom} 入住，{dateTo} 离店</p>
                            <p className="mt-1 text-xs text-slate-500">{selectedRoomNames}</p>
                        </div>
                        <div className="mt-4 space-y-3 text-sm text-slate-600">
                            <div className="flex items-center justify-between"><span>入住人</span><span>{selectedTravelers.length} 人</span></div>
                            <div className="flex items-center justify-between"><span>晚数</span><span>{nights} 晚</span></div>
                            <div className="flex items-center justify-between"><span>房型参考单价</span><span>¥{Math.ceil(selectedConfiguration?.pricePerAdult ?? 0)}</span></div>
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                            <span className="font-semibold text-slate-900">应付金额</span>
                            <span className="text-3xl font-bold text-blue-600">¥{totalPrice.toLocaleString()}</span>
                        </div>
                        <Button
                            fullWidth
                            variant="contained"
                            size="large"
                            sx={{mt: 2, borderRadius: 2}}
                            disabled={!isAuthenticated || submitting || !selectedConfiguration || selectedTravelers.length === 0 || Boolean(stayDateError)}
                            onClick={openCheckoutConfirm}
                        >
                            {!isAuthenticated ? "登录后提交" : submitting ? "提交中" : "提交订单"}
                        </Button>
                        {!isAuthenticated &&
                            <p className="mt-2 text-xs text-orange-500">请先登录账户，才能选择入住人并提交订单。</p>
                        }
                        {selectedTravelers.length === 0 &&
                            <p className="mt-2 text-xs text-orange-500">请先选择或填写入住人。</p>
                        }
                    </section>

                    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-bold text-slate-950">取消规则</h2>
                        <div className="mt-3 space-y-2 text-sm text-slate-600">
                            <p>订单创建后可在订单详情页完成支付。</p>
                            <p>已支付订单取消后会进入退款流程，退款完成时间以订单状态为准。</p>
                            <p>房型与价格会随日期和库存变化，请以下单页展示为准。</p>
                        </div>
                    </section>
                </aside>
            </div>
            {details && selectedConfiguration &&
                <CheckoutConfirmDialog
                    open={checkoutConfirmOpen}
                    title="确认酒店订单"
                    subtitle="提交后将生成待支付订单，支付倒计时为 30 分钟。"
                    travelers={selectedTravelers}
                    summaryRows={[
                        {label: "酒店", value: details.hotelName},
                        {label: "入住日期", value: dateFrom},
                        {label: "离店日期", value: dateTo},
                        {label: "房型", value: selectedRoomNames},
                        {label: "晚数", value: `${nights} 晚`},
                    ]}
                    priceRows={[
                        {label: "房型参考单价", value: `¥${Math.ceil(selectedConfiguration.pricePerAdult)} × ${guestCount} 人`},
                        {label: "入住晚数", value: `${nights} 晚`},
                        {label: "服务费", value: "¥0.00"},
                    ]}
                    totalPrice={totalPrice}
                    rules={[
                        "未支付订单将在 30 分钟后自动超时。",
                        "已支付订单取消后会直接完成退款，钱包支付退回余额。",
                        "房型与价格会随日期和库存变化，请以下单页展示为准。",
                    ]}
                    submitting={submitting}
                    onClose={() => setCheckoutConfirmOpen(false)}
                    onConfirm={submitReservation}
                />
            }
        </div>
    );
};

const RoomConfigurationCard = ({
    configuration,
    index,
    selected,
    nights,
    guestCount,
    canSelect,
    onSelect
}: {
    configuration: HotelRoomConfiguration,
    index: number,
    selected: boolean,
    nights: number,
    guestCount: number,
    canSelect: boolean,
    onSelect: () => void,
}) => {
    const total = Math.ceil(configuration.pricePerAdult * guestCount * nights);

    return (
        <div className={`rounded-lg border ${selected ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"} bg-white p-4`}>
            <div className="grid grid-cols-[1fr_180px] gap-4">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-950">推荐房型 {index + 1}</h3>
                        {selected && <Chip size="small" color="primary" label="已选择"/>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {configuration.rooms.map(room => (
                            <Chip key={room.roomId} icon={<Bed/>} label={`${room.name} · 可住 ${room.guestCapacity} 人`}/>
                        ))}
                    </div>
                    <div className="mt-3 grid gap-2">
                        {configuration.rooms.map(room => (
                            <p key={room.roomId} className="text-sm text-slate-500">{room.description || `${room.name}，适合 ${room.guestCapacity} 人入住。`}</p>
                        ))}
                    </div>
                </div>
                <div className="flex flex-col items-end justify-between text-right">
                    <div>
                        <p className="text-xs text-slate-400">每人每晚参考价</p>
                        <p className="mt-1 text-2xl font-bold text-blue-600">¥{Math.ceil(configuration.pricePerAdult)}</p>
                        <p className="mt-1 text-xs text-slate-500">总价约 ¥{total.toLocaleString()}</p>
                    </div>
                    <Button
                        variant={selected ? "outlined" : "contained"}
                        sx={{borderRadius: 2}}
                        disabled={!canSelect}
                        onClick={onSelect}
                    >
                        {!canSelect ? "登录后选择" : selected ? "已选择" : "选择房型"}
                    </Button>
                </div>
            </div>
        </div>
    );
};

const roomConfigKey = (configuration?: HotelRoomConfiguration | null) => {
    if (!configuration) return "";
    return configuration.rooms.map(room => room.roomId).join("-");
};

export default HotelDetails;
