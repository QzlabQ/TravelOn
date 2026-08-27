import React, {useEffect, useMemo, useRef, useState} from "react";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    LinearProgress,
    Pagination,
    Rating,
    Snackbar,
    TextField,
    ToggleButton,
    ToggleButtonGroup
} from "@mui/material";
import {Bed, Hotel, LocalOffer, Search, Star} from "@mui/icons-material";
import {Link, useLocation, useNavigate} from "react-router-dom";
import {ApiRequests, GetOffersBySearchQueryOffer} from "../../core/apiConfig";
import {BookingPersonPayload} from "../../core/apiConfig";
import {Location} from "../../core/domain/DomainInterfaces";
import {formatDate} from "../../core/utils";
import {addNotification, getBookingPreferences, getCurrentUserSession} from "../../core/currentUser";
import TravelerSelector from "../../account/components/TravelerSelector";
import CheckoutConfirmDialog from "../components/CheckoutConfirmDialog";
import {useAuthSession} from "../../core/useAuthSession";
import {validateStayDates} from "../../core/validation";

const today = new Date();
const nextDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
const HOTEL_PAGE_SIZE = 8;
const popularHotelCities = [
    '北京市',
    '上海市',
    '广州市',
    '深圳市',
    '成都市',
    '重庆市',
    '杭州市',
    '南京市',
    '西安市',
    '三亚市',
    '厦门市',
    '丽江市',
];

type HotelRebookState = {
    dateFrom?: string | null;
    dateTo?: string | null;
    hotelName?: string | null;
    /** Pre-selected destination when arriving from the home-page quick search. */
    destinationId?: string | null;
    /** Set when returning from a hotel detail page so we restore the prior search. */
    restore?: boolean;
};

const HOTEL_SEARCH_SNAPSHOT_KEY = 'hotelBooking:searchSnapshot';

type HotelSearchSnapshot = {
    destinationId?: string;
    dateFrom: string;
    dateTo: string;
    priceFrom: string;
    priceTo: string;
    stars: number;
    hotelType: string;
    roomType: string;
    sortBy: string;
    hotelNameQuery: string;
    offers: GetOffersBySearchQueryOffer[];
    resultPage: number;
    scrollY: number;
};

const readSearchSnapshot = (): HotelSearchSnapshot | null => {
    try {
        const raw = sessionStorage.getItem(HOTEL_SEARCH_SNAPSHOT_KEY);
        return raw ? (JSON.parse(raw) as HotelSearchSnapshot) : null;
    } catch {
        return null;
    }
};

const writeSearchSnapshot = (snapshot: HotelSearchSnapshot) => {
    try {
        sessionStorage.setItem(HOTEL_SEARCH_SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch {
        /* ignore quota/serialization errors */
    }
};

const toDateInputValue = (value?: string | null, fallback = formatDate(today)) => {
    if (!value) return fallback;
    return value.slice(0, 10);
};

const withCommunityHotelRatings = async (offers: GetOffersBySearchQueryOffer[]) => {
    const enriched = await Promise.all(offers.map(async offer => {
        try {
            const response = await ApiRequests.getCommunitySummary({
                targetType: 'HOTEL',
                targetId: String(offer.idHotel),
            });
            return response.data.reviewCount > 0
                ? {...offer, rating: response.data.averageRating}
                : offer;
        } catch {
            return offer;
        }
    }));

    return enriched;
};

const HotelBooking = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const session = useAuthSession();
    const isAuthenticated = Boolean(session);
    const rebookState = (location.state ?? {}) as HotelRebookState;
    const isRestore = Boolean(rebookState.restore);
    // While restoring a prior search, suppress the auto-search effects so the
    // saved results are shown instead of being overwritten by a fresh query.
    const restoreActiveRef = useRef(isRestore);
    const bookingPreferences = useMemo(() => getBookingPreferences(), []);
    const navigateTimerRef = useRef<number | null>(null);
    const checkoutSectionRef = useRef<HTMLDivElement | null>(null);
    const checkoutSummaryRef = useRef<HTMLDivElement | null>(null);
    const [destinations, setDestinations] = useState<Location[]>([]);
    const [destination, setDestination] = useState<Location | undefined>();
    const [dateFrom, setDateFrom] = useState(toDateInputValue(rebookState.dateFrom, formatDate(today)));
    const [dateTo, setDateTo] = useState(toDateInputValue(rebookState.dateTo, formatDate(nextDay)));
    const [priceFrom, setPriceFrom] = useState('');
    const [priceTo, setPriceTo] = useState(bookingPreferences.preferredHotelMaxPrice);
    const [stars, setStars] = useState(bookingPreferences.preferredHotelMinRating);
    const [hotelType, setHotelType] = useState('ALL');
    const [roomType, setRoomType] = useState('ALL');
    const [sortBy, setSortBy] = useState('price');
    const [hotelNameQuery, setHotelNameQuery] = useState(rebookState.hotelName ?? '');
    const [offers, setOffers] = useState<GetOffersBySearchQueryOffer[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [bookingHotelId, setBookingHotelId] = useState<number | null>(null);
    const [bookingMessage, setBookingMessage] = useState('');
    const [bookingError, setBookingError] = useState(false);
    const [toastOpen, setToastOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastError, setToastError] = useState(false);
    const [reservationId, setReservationId] = useState('');
    const [selectedTravelers, setSelectedTravelers] = useState<BookingPersonPayload[]>([]);
    const [selectedOffer, setSelectedOffer] = useState<GetOffersBySearchQueryOffer | null>(null);
    const [checkoutConfirmOpen, setCheckoutConfirmOpen] = useState(false);
    const [hasLoadedDestinations, setHasLoadedDestinations] = useState(false);
    const [resultPage, setResultPage] = useState(1);

    const normalizedPriceFrom = priceFrom.trim() === '' ? 0 : Number(priceFrom);
    const normalizedPriceTo = priceTo.trim() === '' ? Number.POSITIVE_INFINITY : Number(priceTo);
    const hasInvalidPriceRange = Number.isNaN(normalizedPriceFrom) ||
        Number.isNaN(normalizedPriceTo) ||
        normalizedPriceFrom < 0 ||
        normalizedPriceTo < 0 ||
        normalizedPriceFrom > normalizedPriceTo;
    const stayDateError = validateStayDates(dateFrom, dateTo);

    const loadDestinations = async () => {
        setLoading(true);
        setError(false);
        try {
            const response = await ApiRequests.getHotelDestinations();
            const arrivals = response.data ?? [];
            setDestinations(arrivals);
            // Honor a destination passed from the home-page quick search, else default to 北京.
            const requested = rebookState.destinationId
                ? arrivals.find((item: Location) => item.idLocation === rebookState.destinationId)
                : undefined;
            setDestination(requested ?? arrivals.find((item: Location) => item.region === '北京市') ?? arrivals[0]);
        } catch (e) {
            console.log(e);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    const persistSnapshot = () => {
        writeSearchSnapshot({
            destinationId: destination?.idLocation,
            dateFrom,
            dateTo,
            priceFrom,
            priceTo,
            stars,
            hotelType,
            roomType,
            sortBy,
            hotelNameQuery,
            offers,
            resultPage,
            scrollY: window.scrollY,
        });
    };

    const searchHotels = async (showValidation = false) => {
        if (restoreActiveRef.current) return;
        if (!destination) return;
        if (stayDateError) {
            if (showValidation) {
                showToast(stayDateError, true);
            }
            return;
        }

        setLoading(true);
        setError(false);
        try {
            const response = await ApiRequests.searchHotels({
                destinationId: destination.idLocation,
                dateFrom,
                dateTo,
                adults: Math.max(1, selectedTravelers.filter(traveler => traveler.travelerType !== 'CHILD').length || 2),
                hotelName: hotelNameQuery.trim() || undefined,
                minPrice: priceFrom.trim() === '' ? undefined : normalizedPriceFrom,
                maxPrice: priceTo.trim() === '' ? undefined : normalizedPriceTo,
                minRating: undefined,
                hotelType,
                roomType,
                sortBy: sortBy === 'rating' ? 'price' : sortBy,
            });
            const mappedOffers = response.data.map(hotel => ({
                idHotel: hotel.hotelId,
                hotelName: hotel.name,
                description: hotel.description,
                price: hotel.pricePerAdult,
                destination: `${hotel.location.region}, ${hotel.location.country}`,
                rating: hotel.rating,
                imageUrl: hotel.photos[0] ?? '',
            }));
            const communityRatedOffers = await withCommunityHotelRatings(mappedOffers);
            const filteredOffers = communityRatedOffers
                .filter(offer => !stars || offer.rating >= stars)
                .sort((left, right) => {
                    if (sortBy === 'rating') {
                        return right.rating - left.rating;
                    }
                    if (sortBy === 'price_desc') {
                        return right.price - left.price;
                    }
                    return left.price - right.price;
                });
            setOffers(filteredOffers);
            setResultPage(1);
            setSelectedOffer(current => current ? filteredOffers.find(offer => offer.idHotel === current.idHotel) ?? null : null);
        } catch (e) {
            console.log(e);
            setError(true);
            setOffers([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // When returning from a hotel detail page, restore the prior search
        // instead of running a fresh one (handled by the restore effect below).
        if (isRestore && readSearchSnapshot()) return;
        loadDestinations().then(r => r);
    }, []);

    // Restore the saved filters + results when coming back from a hotel detail.
    useEffect(() => {
        if (!isRestore) return;
        const snap = readSearchSnapshot();
        if (!snap) { restoreActiveRef.current = false; return; }

        setDateFrom(snap.dateFrom);
        setDateTo(snap.dateTo);
        setPriceFrom(snap.priceFrom);
        setPriceTo(snap.priceTo);
        setStars(snap.stars);
        setHotelType(snap.hotelType);
        setRoomType(snap.roomType);
        setSortBy(snap.sortBy);
        setHotelNameQuery(snap.hotelNameQuery);
        setOffers(snap.offers);
        setResultPage(snap.resultPage);

        // Load destination options for the dropdown, then select the saved one.
        // Setting `destination` triggers the effect below, which clears the
        // suppression flag (so subsequent user-driven searches work again).
        ApiRequests.getHotelDestinations()
            .then(res => {
                const arrivals = (res.data ?? []) as Location[];
                setDestinations(arrivals);
                setDestination(arrivals.find(item => item.idLocation === snap.destinationId));
            })
            .catch(() => { restoreActiveRef.current = false; });

        const scrollTimer = window.setTimeout(() => window.scrollTo({top: snap.scrollY, behavior: 'auto'}), 150);
        return () => window.clearTimeout(scrollTimer);
    }, []);

    useEffect(() => {
        if (destinations.length === 0) return;
        if (restoreActiveRef.current) {
            // Final restore step: destination just set from the snapshot — skip
            // the search and re-enable searching for later user interactions.
            restoreActiveRef.current = false;
            setHasLoadedDestinations(true);
            return;
        }
        searchHotels().then(r => r);
        setHasLoadedDestinations(true);
    }, [destination]);

    const visibleOffers = offers;
    const hotelPageCount = Math.max(1, Math.ceil(visibleOffers.length / HOTEL_PAGE_SIZE));
    const currentHotelPage = Math.min(resultPage, hotelPageCount);
    const pagedOffers = visibleOffers.slice(
        (currentHotelPage - 1) * HOTEL_PAGE_SIZE,
        currentHotelPage * HOTEL_PAGE_SIZE
    );
    const pageStart = visibleOffers.length === 0 ? 0 : (currentHotelPage - 1) * HOTEL_PAGE_SIZE + 1;
    const pageEnd = Math.min(currentHotelPage * HOTEL_PAGE_SIZE, visibleOffers.length);
    const popularDestinations = popularHotelCities
        .map(city => destinations.find(item => item.region === city))
        .filter((item): item is Location => Boolean(item));
    const selectedGuestCount = selectedTravelers.length;
    const selectedTotalPrice = selectedOffer ? selectedOffer.price * selectedGuestCount : 0;
    const selectedNightCount = useMemo(() => {
        const start = new Date(dateFrom);
        const end = new Date(dateTo);
        const diff = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
        return Math.max(1, Number.isFinite(diff) ? diff : 1);
    }, [dateFrom, dateTo]);
    const selectedRoomName = roomType === 'DOUBLE' ? '大床房' : roomType === 'FAMILY' ? '家庭房' : '标准房';

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

    const scrollToCheckoutSection = () => {
        (checkoutSummaryRef.current || checkoutSectionRef.current)?.scrollIntoView({behavior: 'smooth', block: 'center'});
    };

    useEffect(() => clearAutoNavigate, []);

    useEffect(() => {
        if (restoreActiveRef.current) return;
        if (!hasLoadedDestinations || !destination || hasInvalidPriceRange || stayDateError) return;

        const timeoutId = window.setTimeout(() => {
            searchHotels().then(r => r);
        }, 350);

        return () => window.clearTimeout(timeoutId);
    }, [hotelNameQuery, priceFrom, priceTo, stars, hotelType, roomType, sortBy, dateFrom, dateTo, selectedTravelers]);

    const selectHotel = (offer: GetOffersBySearchQueryOffer) => {
        if (!isAuthenticated) {
            setBookingError(true);
            setBookingMessage('请先登录账户，再选择酒店并提交订单。');
            showToast('登录后才能选择和下单', true);
            return;
        }

        setSelectedOffer(offer);
        setBookingError(false);
        setBookingMessage('');
        scrollToCheckoutSection();
    };

    const openCheckoutConfirm = () => {
        if (!isAuthenticated) {
            setBookingError(true);
            setBookingMessage('请先登录账户，再选择酒店并提交订单。');
            showToast('请先登录后再提交订单', true);
            return;
        }
        if (stayDateError) {
            setBookingError(true);
            setBookingMessage(stayDateError);
            showToast(stayDateError, true);
            return;
        }
        if (!selectedOffer) {
            setBookingError(true);
            setBookingMessage('请先选择一家可预订酒店。');
            showToast('请先选择一家可预订酒店', true);
            return;
        }
        if (selectedTravelers.length === 0) {
            setBookingError(true);
            setBookingMessage('请先选择或填写至少一位入住人。');
            showToast('请先选择或填写入住人', true);
            return;
        }

        setCheckoutConfirmOpen(true);
    };

    const submitHotelReservation = async () => {
        if (!isAuthenticated || !selectedOffer || selectedTravelers.length === 0) {
            setCheckoutConfirmOpen(false);
            return;
        }
        if (stayDateError) {
            setBookingError(true);
            setBookingMessage(stayDateError);
            showToast(stayDateError, true);
            return;
        }
        setBookingHotelId(selectedOffer.idHotel);
        setBookingError(false);
        setBookingMessage('');
        setCheckoutConfirmOpen(false);

        const session = getCurrentUserSession();
        if (!session) {
            setBookingError(true);
            setBookingMessage('请先登录后再预订');
            return;
        }

        try {
            const response = await ApiRequests.createHotelReservation(session.token, {
                userId: session.user.id,
                hotelId: selectedOffer.idHotel,
                hotelName: selectedOffer.hotelName,
                dateFrom,
                dateTo,
                adultsQuantity: selectedTravelers.filter(traveler => traveler.travelerType !== 'CHILD').length,
                childrenUnder3Quantity: 0,
                childrenUnder10Quantity: 0,
                childrenUnder18Quantity: selectedTravelers.filter(traveler => traveler.travelerType === 'CHILD').length,
                price: selectedOffer.price * selectedTravelers.length,
                roomName: selectedRoomName,
                travelers: selectedTravelers,
            });
            setReservationId(response.data.id);
            addNotification({
                type: "ORDER_CREATED",
                title: "酒店订单已创建",
                message: `${selectedOffer.hotelName} 已创建待支付订单，请在 30 分钟内完成支付。`,
                reservationId: response.data.id,
            });
            setBookingMessage(`已创建酒店预订 ${response.data.id}，请在订单详情中完成支付。`);
            showToast('订单提交成功，即将进入订单详情');
            clearAutoNavigate();
            navigateTimerRef.current = window.setTimeout(() => {
                navigate(`/reservations/${response.data.id}#payment-countdown`);
            }, 2000);
        } catch (e) {
            console.log(e);
            setBookingError(true);
            showToast('提交失败，请稍后再试', true);
        } finally {
            setBookingHotelId(null);
        }
    };

    return (
        <div className='min-h-screen bg-slate-50 px-8 py-8'>
            <Snackbar
                open={toastOpen}
                autoHideDuration={1800}
                onClose={() => setToastOpen(false)}
                anchorOrigin={{vertical: 'top', horizontal: 'center'}}
                sx={{mt: 2, zIndex: theme => theme.zIndex.modal + 1}}
            >
                <Alert
                    severity={toastError ? 'error' : 'success'}
                    onClose={() => setToastOpen(false)}
                    action={!toastError && reservationId ?
                        <Button
                            component={Link}
                            to={`/reservations/${reservationId}#payment-countdown`}
                            color='inherit'
                            size='small'
                            onClick={clearAutoNavigate}
                        >
                            查看订单
                        </Button>
                        : undefined
                    }
                    sx={{minWidth: 320, borderRadius: 2, boxShadow: 6, fontSize: 16, alignItems: 'center'}}
                >
                    {toastMessage}
                </Alert>
            </Snackbar>

            <div className='mb-6 rounded-lg bg-white border border-slate-200 px-7 py-6 shadow-sm'>
                <Chip icon={<Hotel/>} label='酒店服务' sx={{backgroundColor: '#eff6ff', color: '#2563eb'}}/>
                <div className='mt-4 flex flex-wrap items-end justify-between gap-4'>
                    <div>
                        <h1 className='text-3xl font-bold text-slate-950'>酒店预订</h1>
                        <p className='mt-2 text-slate-500'>按目的地、日期、评分和房型筛选可预订酒店</p>
                    </div>
                    <div className='flex gap-2'>
                        <Chip icon={<Bed/>} label={`${visibleOffers.length} 家酒店`}/>
                        <Chip icon={<Star/>} label={stars ? `${stars} 分以上` : '不限评分'}/>
                    </div>
                </div>
            </div>

            {error && <Alert severity='warning' className='mb-4'>后端酒店数据暂时不可用，请启动服务后重试。</Alert>}
            {stayDateError && <Alert severity='warning' className='mb-4'>{stayDateError}</Alert>}
            {!isAuthenticated && <Alert severity='info' className='mb-4'>未登录时可以查询酒店价格和查看详情；登录后才能选择入住人、选择酒店并提交订单。</Alert>}
            {bookingError && <Alert severity='error' className='mb-4'>创建酒店预订失败，请检查日期或后端服务。</Alert>}
            {bookingMessage && <Alert severity={bookingError ? 'warning' : 'success'} className='mb-4' action={reservationId ? <Button component={Link} to={`/reservations/${reservationId}#payment-countdown`} color='inherit' size='small'>订单详情</Button> : undefined}>{bookingMessage}</Alert>}

            <div className='grid grid-cols-[360px_1fr] gap-6 items-start'>
                <aside className='sticky top-24 self-start flex max-h-[calc(100vh-7rem)] flex-col gap-5 overflow-y-auto pr-1'>
                    <section className='rounded-lg bg-white border border-slate-200 p-5 shadow-sm'>
                        <h2 className='text-lg font-bold text-slate-900 mb-4'>查询酒店</h2>
                        <TextField
                            fullWidth
                            size='small'
                            label='酒店名称'
                            value={hotelNameQuery}
                            onChange={event => setHotelNameQuery(event.target.value)}
                            placeholder='输入酒店名搜索'
                            sx={{mb: 2}}
                        />
                        <Autocomplete
                            fullWidth
                            size='small'
                            options={destinations}
                            value={destination ?? null}
                            noOptionsText='没有匹配城市'
                            getOptionLabel={(option) => `${option.region}, ${option.country}`}
                            isOptionEqualToValue={(option, value) => option.idLocation === value.idLocation}
                            onChange={(_, value) => setDestination(value ?? undefined)}
                            renderInput={(params) => <TextField {...params} label='住宿地'/>}
                        />
                        {popularDestinations.length > 0 &&
                            <div className='mt-4'>
                                <p className='mb-2 text-xs font-semibold text-slate-500'>热门城市</p>
                                <div className='flex flex-wrap gap-2'>
                                    {popularDestinations.map(item => (
                                        <Chip
                                            key={item.idLocation}
                                            size='small'
                                            label={item.region.replace('市', '')}
                                            onClick={() => setDestination(item)}
                                            sx={{cursor: 'pointer', backgroundColor: '#f8fafc'}}
                                        />
                                    ))}
                                </div>
                            </div>
                        }
                        <label className='block mt-5 text-sm font-semibold text-slate-700'>
                            入住和离店日期
                            <div className='grid grid-cols-2 gap-3 mt-2'>
                                <input className='rounded-lg border border-slate-300 px-3 py-2 text-slate-900' type='date' value={dateFrom} onChange={event => setDateFrom(event.target.value)}/>
                                <input className='rounded-lg border border-slate-300 px-3 py-2 text-slate-900' type='date' value={dateTo} onChange={event => setDateTo(event.target.value)}/>
                            </div>
                            <p className={`mt-2 text-xs ${stayDateError ? 'text-red-500' : 'text-slate-500'}`}>
                                {stayDateError || '入住日期不能早于今天，离店日期需晚于入住日期。'}
                            </p>
                        </label>
                        <Button fullWidth variant='contained' size='large' startIcon={<Search/>} sx={{mt: 2, borderRadius: 2}} onClick={() => searchHotels(true)} disabled={loading || !destination || hasInvalidPriceRange || Boolean(stayDateError)}>
                            查询
                        </Button>
                    </section>

                    <section className='rounded-lg bg-white border border-slate-200 p-5 shadow-sm'>
                        <h2 className='text-lg font-bold text-slate-900 mb-4'>高级筛选</h2>
                        <p className='mb-2 text-sm font-semibold text-slate-700'>价格区间</p>
                        <div className='grid grid-cols-2 gap-3'>
                            <TextField
                                size='small'
                                label='最低价'
                                type='number'
                                value={priceFrom}
                                onChange={event => setPriceFrom(event.target.value)}
                                placeholder='不限'
                                inputProps={{min: 0}}
                            />
                            <TextField
                                size='small'
                                label='最高价'
                                type='number'
                                value={priceTo}
                                onChange={event => setPriceTo(event.target.value)}
                                placeholder='不限'
                                inputProps={{min: 0}}
                            />
                        </div>
                        <p className={`text-sm mb-5 mt-2 ${hasInvalidPriceRange ? 'text-red-500' : 'text-slate-500'}`}>
                            {hasInvalidPriceRange ? '请输入有效价格区间' : `当前：${priceFrom || '不限'} - ${priceTo || '不限'}`}
                        </p>

                        <p className='mb-2 text-sm font-semibold text-slate-700'>最低评分</p>
                        <Rating value={stars} onChange={(_, value) => setStars(value ?? 0)}/>
                        <p className='mt-1 text-xs text-slate-500'>{stars ? `只看 ${stars} 分及以上酒店` : '当前不限制评分'}</p>

                        <p className='mt-5 mb-2 text-sm font-semibold text-slate-700'>酒店类型</p>
                        <ToggleButtonGroup fullWidth color='primary' size='small' value={hotelType} exclusive onChange={(_, value) => value && setHotelType(value)}>
                            <ToggleButton value='ALL'>全部</ToggleButton>
                            <ToggleButton value='HOTEL'>酒店</ToggleButton>
                            <ToggleButton value='HOMESTAY'>民宿</ToggleButton>
                        </ToggleButtonGroup>

                        <p className='mt-5 mb-2 text-sm font-semibold text-slate-700'>房型</p>
                        <ToggleButtonGroup fullWidth color='primary' size='small' value={roomType} exclusive onChange={(_, value) => value && setRoomType(value)}>
                            <ToggleButton value='ALL'>全部</ToggleButton>
                            <ToggleButton value='DOUBLE'>大床</ToggleButton>
                            <ToggleButton value='FAMILY'>家庭</ToggleButton>
                        </ToggleButtonGroup>

                        <p className='mt-5 mb-2 text-sm font-semibold text-slate-700'>排序</p>
                        <ToggleButtonGroup fullWidth color='primary' size='small' value={sortBy} exclusive onChange={(_, value) => value && setSortBy(value)}>
                            <ToggleButton value='price'>低价优先</ToggleButton>
                            <ToggleButton value='rating'>评分优先</ToggleButton>
                            <ToggleButton value='price_desc'>高价优先</ToggleButton>
                        </ToggleButtonGroup>

                        <Button fullWidth variant='outlined' sx={{mt: 2, borderRadius: 2}} onClick={() => searchHotels(true)} disabled={loading || !destination || hasInvalidPriceRange || Boolean(stayDateError)}>
                            应用筛选
                        </Button>
                    </section>
                </aside>

                <main className='min-w-0'>
                    {loading && <Box sx={{height: 5}} className='mb-4'><LinearProgress/></Box>}
                    <section className='rounded-lg bg-white border border-slate-200 p-5 shadow-sm'>
                        <div className='flex items-center justify-between gap-4'>
                            <h2 className='text-xl font-bold text-slate-950'>酒店列表</h2>
                            <p className='text-sm text-slate-500'>
                                {visibleOffers.length > 0 ? `显示 ${pageStart}-${pageEnd} / 共 ${visibleOffers.length} 家` : '暂无匹配酒店'}
                            </p>
                        </div>
                        <div className='mt-4 rounded-lg bg-slate-50 p-3 pr-2'>
                            {pagedOffers.map(offer => (
                                <HotelResultCard
                                    key={offer.idHotel}
                                    offer={offer}
                                    roomType={roomType}
                                    dateFrom={dateFrom}
                                    dateTo={dateTo}
                                    adults={Math.max(1, selectedTravelers.filter(traveler => traveler.travelerType !== 'CHILD').length || 2)}
                                    onBook={selectHotel}
                                    onView={persistSnapshot}
                                    reserving={bookingHotelId === offer.idHotel}
                                    canBook={isAuthenticated}
                                    selected={selectedOffer?.idHotel === offer.idHotel}
                                />
                            ))}
                            {visibleOffers.length === 0 && !loading &&
                                <div className='rounded-lg border border-dashed border-slate-300 bg-white px-4 py-16 text-center text-slate-500'>
                                    <p>暂无匹配酒店，可以换个城市或放宽价格、评分条件</p>
                                    {popularDestinations.length > 0 &&
                                        <div className='mt-4 flex flex-wrap justify-center gap-2'>
                                            {popularDestinations.slice(0, 8).map(item => (
                                                <Chip key={item.idLocation} size='small' label={`看看${item.region.replace('市', '')}`} onClick={() => setDestination(item)} sx={{cursor: 'pointer'}}/>
                                            ))}
                                        </div>
                                    }
                                </div>
                            }
                        </div>
                        {visibleOffers.length > HOTEL_PAGE_SIZE &&
                            <div className='mt-4 flex justify-center'>
                                <Pagination
                                    count={hotelPageCount}
                                    page={currentHotelPage}
                                    color='primary'
                                    onChange={(_, page) => setResultPage(page)}
                                />
                            </div>
                        }
                    </section>

                    <section ref={checkoutSectionRef} className='mt-5 rounded-lg bg-white border border-slate-200 p-5 shadow-sm'>
                        <div className='flex flex-wrap items-center justify-between gap-3'>
                            <div>
                                <h2 className='text-xl font-bold text-slate-950'>填写订单</h2>
                                <p className='mt-1 text-sm text-slate-500'>确认酒店后，请在这里填写入住人并提交订单。</p>
                            </div>
                            {selectedOffer &&
                                <Chip
                                    color='primary'
                                    variant='outlined'
                                    label={selectedOffer.hotelName}
                                />
                            }
                        </div>
                        <div className='mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]'>
                            <div className='space-y-4'>
                                {selectedOffer ? (
                                    <div className='rounded-lg border border-slate-200 bg-slate-50 p-4'>
                                        <div className='flex flex-wrap items-start justify-between gap-4'>
                                            <div>
                                                <p className='text-lg font-semibold text-slate-900'>{selectedOffer.hotelName}</p>
                                                <p className='mt-2 text-sm text-slate-600'>{selectedOffer.destination}</p>
                                                <p className='mt-1 text-sm text-slate-600'>{dateFrom} 入住 · {dateTo} 离店 · {selectedNightCount} 晚</p>
                                            </div>
                                            <div className='text-right'>
                                                <p className='text-sm text-slate-500'>评分</p>
                                                <p className='mt-1 text-base font-semibold text-slate-900'>{selectedOffer.rating.toFixed(1)}</p>
                                                <p className='mt-1 text-xs text-slate-500'>{selectedRoomName}</p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className='rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500'>
                                        请选择要预订的酒店。
                                    </div>
                                )}
                                <TravelerSelector title='选择入住人' onChange={setSelectedTravelers}/>
                            </div>
                            <section ref={checkoutSummaryRef} className='rounded-lg border border-slate-200 bg-slate-50 p-4 lg:sticky lg:top-24 lg:self-start'>
                                <h3 className='text-lg font-bold text-slate-900'>订单信息</h3>
                                {selectedOffer ? (
                                    <div className='mt-4 space-y-3'>
                                        <div className='flex items-center justify-between text-sm text-slate-600'>
                                            <span>入住人</span>
                                            <span>{selectedGuestCount} 人</span>
                                        </div>
                                        <div className='flex items-center justify-between text-sm text-slate-600'>
                                            <span>参考单价</span>
                                            <span>¥{Math.ceil(selectedOffer.price)}</span>
                                        </div>
                                        <div className='flex items-center justify-between text-sm text-slate-600'>
                                            <span>入住晚数</span>
                                            <span>{selectedNightCount} 晚</span>
                                        </div>
                                        <div className='flex items-center justify-between border-t border-slate-200 pt-3'>
                                            <span className='font-semibold text-slate-900'>应付金额</span>
                                            <span className='text-2xl font-bold text-blue-600'>¥{Math.ceil(selectedTotalPrice)}</span>
                                        </div>
                                        <Button
                                            fullWidth
                                            variant='contained'
                                            size='large'
                                            sx={{borderRadius: 2}}
                                            disabled={!isAuthenticated || bookingHotelId === selectedOffer.idHotel || selectedGuestCount === 0 || Boolean(stayDateError)}
                                            onClick={openCheckoutConfirm}
                                        >
                                            {!isAuthenticated ? '登录后提交' : bookingHotelId === selectedOffer.idHotel ? '提交中' : '提交订单'}
                                        </Button>
                                        {!isAuthenticated &&
                                            <p className='text-xs text-orange-500'>请先登录账户，才能选择入住人并提交订单。</p>
                                        }
                                        {selectedGuestCount === 0 &&
                                            <p className='text-xs text-orange-500'>请先选择或填写入住人。</p>
                                        }
                                    </div>
                                ) : (
                                    <div className='mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500'>
                                        选择酒店后显示订单金额与提交入口。
                                    </div>
                                )}
                            </section>
                        </div>
                    </section>
                </main>
            </div>
            {selectedOffer &&
                <CheckoutConfirmDialog
                    open={checkoutConfirmOpen}
                    title="确认酒店订单"
                    subtitle="提交后将生成待支付订单，支付倒计时为 30 分钟。"
                    travelers={selectedTravelers}
                    summaryRows={[
                        {label: "酒店", value: selectedOffer.hotelName},
                        {label: "目的地", value: selectedOffer.destination},
                        {label: "入住日期", value: dateFrom},
                        {label: "离店日期", value: dateTo},
                        {label: "房型偏好", value: selectedRoomName},
                    ]}
                    priceRows={[
                        {label: "参考房价", value: `¥${Math.ceil(selectedOffer.price)} × ${selectedGuestCount} 人`},
                        {label: "入住晚数", value: `${selectedNightCount} 晚`},
                        {label: "服务费", value: "¥0.00"},
                    ]}
                    totalPrice={selectedTotalPrice}
                    rules={[
                        "未支付订单将在 30 分钟后自动超时。",
                        "已支付订单取消后会直接完成退款，钱包支付退回余额。",
                        "房型和价格会随库存与日期变化，提交订单前请再次确认。",
                    ]}
                    submitting={bookingHotelId === selectedOffer.idHotel}
                    onClose={() => setCheckoutConfirmOpen(false)}
                    onConfirm={submitHotelReservation}
                />
            }
        </div>
    );
};

const HotelResultCard = ({
    offer,
    roomType,
    dateFrom,
    dateTo,
    adults,
    onBook,
    onView,
    reserving,
    canBook,
    selected = false
}: {
    offer: GetOffersBySearchQueryOffer,
    roomType: string,
    dateFrom: string,
    dateTo: string,
    adults: number,
    onBook: (offer: GetOffersBySearchQueryOffer) => void,
    onView: () => void,
    reserving: boolean
    canBook: boolean
    selected?: boolean
}) => (
    <section className={`mb-4 overflow-hidden rounded-lg border ${selected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'} bg-white shadow-sm transition-shadow hover:shadow-md`}>
        <div className='grid grid-cols-[220px_1fr_190px]'>
            <img src={offer.imageUrl} alt={offer.hotelName} className='h-full min-h-[190px] w-full object-cover'/>
            <div className='p-5'>
                <div className='flex flex-wrap items-center gap-2'>
                    <h3 className='text-xl font-bold text-slate-950'>{offer.hotelName}</h3>
                    <Chip size='small' color='primary' label={offer.rating.toFixed(1)}/>
                </div>
                <p className='mt-2 text-sm text-slate-500'>{offer.destination}</p>
                <div className='mt-4 flex flex-wrap gap-2'>
                    <Chip size='small' label='立即确认'/>
                    <Chip size='small' label='可免费取消'/>
                    <Chip size='small' label='在线付款'/>
                    <Chip size='small' label={roomType === 'DOUBLE' ? '大床房优先' : roomType === 'FAMILY' ? '家庭房优先' : '房型不限'}/>
                </div>
                <p className='mt-4 line-clamp-2 text-sm text-slate-600'>{offer.description || '酒店位置便利，适合休闲旅行和家庭出游。进入详情页后可继续选择具体房型。'}</p>
                <p className='mt-3 text-sm text-emerald-600'>订单确认后 30 分钟内免费取消</p>
            </div>
            <div className='flex flex-col items-end justify-end border-l border-slate-200 p-5 text-right'>
                <p className='text-xs text-orange-500'>参考价</p>
                <p className='mt-2 text-slate-400 line-through'>¥{Math.ceil(offer.price * 1.18).toLocaleString()}</p>
                <p className='text-3xl font-bold text-blue-600'>¥{Math.ceil(offer.price).toLocaleString()} <span className='text-sm'>起</span></p>
                <div className='mt-2 flex flex-col gap-2'>
                    <Button
                        variant='contained'
                        sx={{borderRadius: 2}}
                        startIcon={<LocalOffer/>}
                        disabled={reserving || !canBook}
                        onClick={() => onBook(offer)}
                    >
                        {!canBook ? '登录后选择' : reserving ? '提交中' : selected ? '继续预订' : '去预订'}
                    </Button>
                    <Link
                        to={`/reservations/hotels/${offer.idHotel}?dateFrom=${dateFrom}&dateTo=${dateTo}&adults=${adults}`}
                        state={{offer, dateFrom, dateTo, adults, roomType, back: {to: '/reservations/hotels', label: '返回酒店列表', state: {restore: true}}}}
                        onClick={onView}
                    >
                        <Button fullWidth variant='outlined' sx={{borderRadius: 2}}>查看酒店</Button>
                    </Link>
                </div>
            </div>
        </div>
    </section>
);

export default HotelBooking;
