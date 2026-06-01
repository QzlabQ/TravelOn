import React, {useEffect, useMemo, useState} from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    FormControl,
    InputLabel,
    LinearProgress,
    MenuItem,
    Select,
    Slider,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup
} from "@mui/material";
import {
    ArrowForward,
    CheckCircle,
    Flight,
    Search,
    SwapHoriz,
    Train,
    Tune
} from "@mui/icons-material";
import {ApiRequests, TicketSearchOffer} from "../../core/apiConfig";
import {getCurrentUserId} from "../../core/currentUser";

type TicketMode = 'flight' | 'train';

type TicketBookingProps = {
    mode: TicketMode;
};

const modeConfig = {
    flight: {
        title: '机票订票与比价',
        eyebrow: '航班服务',
        icon: <Flight style={{fontSize: 18}}/>,
        fromLabel: '出发机场/城市',
        toLabel: '到达机场/城市',
        lowPrice: 0,
        highPrice: 3600,
        codePrefix: 'CA',
        hero: '比较直飞、联程与不同舱位价格',
        accent: '#2563eb',
    },
    train: {
        title: '火车票订票与比价',
        eyebrow: '铁路服务',
        icon: <Train style={{fontSize: 18}}/>,
        fromLabel: '出发站/城市',
        toLabel: '到达站/城市',
        lowPrice: 0,
        highPrice: 2200,
        codePrefix: 'G',
        hero: '筛选高铁、动车与普速列车',
        accent: '#0f766e',
    }
};

const today = new Date().toISOString().slice(0, 10);

const TicketCard = ({
    offer,
    mode,
    compact = false,
    onReserve,
    reserving = false
}: {
    offer: TicketSearchOffer,
    mode: TicketMode,
    compact?: boolean,
    onReserve?: (offer: TicketSearchOffer) => void,
    reserving?: boolean
}) => {
    const config = modeConfig[mode];

    return (
        <div className={`bg-white rounded-lg border border-slate-200 ${compact ? 'w-full' : 'min-w-[760px]'} p-5 shadow-sm hover:shadow-md transition-shadow`}>
            <div className='flex items-start justify-between gap-5'>
                <Chip
                    size='small'
                    icon={<CheckCircle/>}
                    label={`成功率 ${offer.successRate}`}
                    sx={{backgroundColor: '#ecfdf5', color: '#047857'}}
                />
                <p className='text-xs text-orange-500'>{offer.notice}</p>
            </div>

            <div className='mt-5 flex flex-row items-center gap-5'>
                <div className='w-28'>
                    <p className='text-3xl font-bold' style={{color: config.accent}}>{offer.departureTime}</p>
                    <p className='mt-1 text-sm font-semibold text-slate-800'>{offer.departureStation}</p>
                </div>
                <div className='flex-1 flex flex-col items-center text-slate-500'>
                    <p className='text-sm'>{offer.duration}</p>
                    <div className='my-2 flex flex-row items-center w-full gap-2'>
                        <div className='h-px bg-slate-300 flex-1'/>
                        <Chip size='small' label={offer.code} variant='outlined'/>
                        <div className='h-px bg-slate-300 flex-1'/>
                    </div>
                    <p className='text-xs'>{offer.carrier} · {offer.seatClass}</p>
                </div>
                <div className='w-28'>
                    <p className='text-3xl font-bold text-slate-900'>{offer.arrivalTime}</p>
                    <p className='mt-1 text-sm font-semibold text-slate-800'>{offer.arrivalStation}</p>
                </div>
                <div className='w-32 text-right'>
                    <p className='text-sm text-slate-400'>样本参考价</p>
                    <p className='text-3xl font-bold text-orange-500'>¥{offer.price}</p>
                    <a className='mt-1 block text-xs text-blue-600 hover:underline' href={offer.sourceUrl} target='_blank' rel='noreferrer'>查看样本来源</a>
                </div>
                <Button
                    variant='contained'
                    size='large'
                    sx={{borderRadius: 2}}
                    disabled={reserving}
                    onClick={() => onReserve?.(offer)}
                >
                    {reserving ? '预订中' : '预订'}
                </Button>
            </div>
        </div>
    );
};

const TicketBooking = ({mode}: TicketBookingProps) => {
    const config = modeConfig[mode];
    const [departures, setDepartures] = useState<string[]>([]);
    const [arrivals, setArrivals] = useState<string[]>([]);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [date, setDate] = useState(today);
    const [sortBy, setSortBy] = useState('departure');
    const [priceRange, setPriceRange] = useState<number[]>([config.lowPrice, config.highPrice]);
    const [studentOnly, setStudentOnly] = useState(false);
    const [onlyAvailable, setOnlyAvailable] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [bookingId, setBookingId] = useState('');
    const [bookingMessage, setBookingMessage] = useState('');
    const [bookingError, setBookingError] = useState(false);
    const [ticketOffers, setTicketOffers] = useState<TicketSearchOffer[]>([]);

    const offers = useMemo(() => ticketOffers
        .filter(offer => offer.price >= priceRange[0] && offer.price <= priceRange[1])
        .filter(offer => !studentOnly || offer.studentEligible)
        .filter(offer => !onlyAvailable || offer.remainingSeats > 0)
        .sort((a, b) => sortBy === 'price' ? a.price - b.price : a.departureTime.localeCompare(b.departureTime)), [ticketOffers, priceRange, sortBy, studentOnly, onlyAvailable]);
    const recommendedOffer = offers[0];
    const moreOffers = recommendedOffer ? offers.filter(offer => offer.id !== recommendedOffer.id) : [];

    const searchTickets = async (departureCity = from, arrivalCity = to, departureDate = date) => {
        if (!departureCity || !arrivalCity) return;

        setLoading(true);
        setError(false);
        try {
            const response = await ApiRequests.searchTickets({
                type: mode === 'flight' ? 'FLIGHT' : 'TRAIN',
                departureCity,
                arrivalCity,
                departureDate,
            });
            setTicketOffers(response.data);
        } catch (e) {
            console.log(e);
            setTicketOffers([]);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        setError(false);
        ApiRequests.getTicketOptions(mode === 'flight' ? 'FLIGHT' : 'TRAIN')
            .then(response => {
                const nextDepartures = response.data.departures ?? [];
                const nextArrivals = response.data.arrivals ?? [];
                const nextFrom = nextDepartures[0] ?? '';
                const nextTo = nextArrivals.find(item => item !== nextFrom) ?? nextArrivals[0] ?? '';
                setDepartures(nextDepartures);
                setArrivals(nextArrivals);
                setFrom(nextFrom);
                setTo(nextTo);
                return searchTickets(nextFrom, nextTo);
            })
            .catch(e => {
                console.log(e);
                setError(true);
            })
            .finally(() => setLoading(false));
    }, [mode]);

    const swapLocations = () => {
        const oldFrom = from;
        setFrom(to);
        setTo(oldFrom);
    };

    const updatePriceBound = (index: 0 | 1, value: string) => {
        const parsedValue = Number(value);
        if (Number.isNaN(parsedValue)) return;

        const nextRange = [...priceRange];
        nextRange[index] = Math.min(config.highPrice, Math.max(config.lowPrice, parsedValue));

        if (index === 0 && nextRange[0] > nextRange[1]) {
            nextRange[1] = nextRange[0];
        }
        if (index === 1 && nextRange[1] < nextRange[0]) {
            nextRange[0] = nextRange[1];
        }

        setPriceRange(nextRange);
    };

    const reserveTicket = async (offer: TicketSearchOffer) => {
        setBookingId(offer.id);
        setBookingError(false);
        setBookingMessage('');

        try {
            const response = await ApiRequests.createTicketReservation({
                userId: getCurrentUserId(),
                transportType: mode === 'flight' ? 'FLIGHT' : 'TRAIN',
                routeFrom: from || '出发地',
                routeTo: to || '目的地',
                departureDate: date,
                departureTime: offer.departureTime,
                arrivalTime: offer.arrivalTime,
                provider: offer.carrier,
                bookingCode: offer.code,
                passengerCount: 1,
                price: offer.price,
            });
            setBookingMessage(`已创建预订 ${response.data.id}，可到“我的预订”继续支付或取消。`);
        } catch (e) {
            console.log(e);
            setBookingError(true);
        } finally {
            setBookingId('');
        }
    };

    return (
        <div className='min-h-screen bg-slate-50 px-8 py-8'>
            <div className='mb-6 rounded-lg bg-white border border-slate-200 px-7 py-6 shadow-sm'>
                <Chip icon={config.icon} label={config.eyebrow} sx={{backgroundColor: '#eff6ff', color: config.accent}}/>
                <div className='mt-4 flex flex-wrap items-end justify-between gap-4'>
                    <div>
                        <h1 className='text-3xl font-bold text-slate-950'>{config.title}</h1>
                        <p className='mt-2 text-slate-500'>{config.hero}</p>
                    </div>
                    <div className='flex gap-2'>
                        <Chip icon={<ArrowForward/>} label={`${from || '-'} 到 ${to || '-'}`}/>
                        <Chip icon={<Tune/>} label={`${offers.length} 个方案`}/>
                    </div>
                </div>
            </div>

            {error && <Alert severity='warning' className='mb-4'>后端票务数据暂时不可用，请确认交通服务已启动。</Alert>}
            {bookingError && <Alert severity='error' className='mb-4'>创建预订失败，请确认后端服务已启动。</Alert>}
            {bookingMessage && <Alert severity='success' className='mb-4'>{bookingMessage}</Alert>}

            <div className='grid grid-cols-[360px_1fr] gap-6 items-start'>
                <aside className='sticky top-24 self-start flex max-h-[calc(100vh-7rem)] flex-col gap-5 overflow-y-auto pr-1'>
                    <section className='rounded-lg bg-white border border-slate-200 p-5 shadow-sm'>
                        <h2 className='text-lg font-bold text-slate-900 mb-4'>查询行程</h2>
                        <div className='grid grid-cols-[1fr_44px_1fr] items-center gap-2'>
                            <FormControl fullWidth size='small'>
                                <InputLabel>{config.fromLabel}</InputLabel>
                                <Select value={from} label={config.fromLabel} onChange={event => setFrom(event.target.value)}>
                                    {departures.map(item => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <Button onClick={swapLocations} variant='outlined' sx={{minWidth: 44, height: 40, borderRadius: 2}}>
                                <SwapHoriz/>
                            </Button>
                            <FormControl fullWidth size='small'>
                                <InputLabel>{config.toLabel}</InputLabel>
                                <Select value={to} label={config.toLabel} onChange={event => setTo(event.target.value)}>
                                    {arrivals.map(item => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </div>
                        <label className='block mt-5 text-sm font-semibold text-slate-700'>
                            出行日期
                            <input className='mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900' type='date' value={date} onChange={event => setDate(event.target.value)}/>
                        </label>
                        <Button fullWidth variant='contained' size='large' startIcon={<Search/>} sx={{mt: 2, borderRadius: 2}} onClick={() => searchTickets()} disabled={loading || !from || !to}>
                            {loading ? '查询中' : '查询'}
                        </Button>
                    </section>

                    <section className='rounded-lg bg-white border border-slate-200 p-5 shadow-sm'>
                        <h2 className='text-lg font-bold text-slate-900 mb-4'>高级筛选</h2>
                        <div className='flex items-center justify-between mb-3'>
                            <span className='text-sm text-slate-700'>学生票</span>
                            <Switch checked={studentOnly} onChange={event => setStudentOnly(event.target.checked)}/>
                        </div>
                        <div className='flex items-center justify-between mb-5'>
                            <span className='text-sm text-slate-700'>只看有票</span>
                            <Switch checked={onlyAvailable} onChange={event => setOnlyAvailable(event.target.checked)}/>
                        </div>
                        <p className='mb-2 text-sm font-semibold text-slate-700'>价格区间</p>
                        <div className='grid grid-cols-2 gap-3'>
                            <TextField
                                size='small'
                                label='最低价'
                                type='number'
                                value={priceRange[0]}
                                onChange={event => updatePriceBound(0, event.target.value)}
                                inputProps={{min: config.lowPrice, max: config.highPrice}}
                            />
                            <TextField
                                size='small'
                                label='最高价'
                                type='number'
                                value={priceRange[1]}
                                onChange={event => updatePriceBound(1, event.target.value)}
                                inputProps={{min: config.lowPrice, max: config.highPrice}}
                            />
                        </div>
                        <Slider value={priceRange} min={config.lowPrice} max={config.highPrice} onChange={(_, value) => setPriceRange(value as number[])}/>
                        <p className='text-sm text-slate-500 mb-5'>¥{priceRange[0]} - ¥{priceRange[1]}</p>
                        <p className='mb-2 text-sm font-semibold text-slate-700'>系统排序</p>
                        <ToggleButtonGroup fullWidth color='primary' size='small' value={sortBy} exclusive onChange={(_, value) => value && setSortBy(value)}>
                            <ToggleButton value='departure'>出发时间</ToggleButton>
                            <ToggleButton value='price'>价格</ToggleButton>
                        </ToggleButtonGroup>
                    </section>
                </aside>

                <main className='min-w-0'>
                    {loading && <Box sx={{height: 5}} className='mb-4'><LinearProgress/></Box>}
                    <section className='rounded-lg bg-white border border-slate-200 p-5 shadow-sm overflow-x-auto'>
                        <div className='mb-4 flex items-center justify-between'>
                            <h2 className='text-xl font-bold text-slate-950'>推荐方案</h2>
                            <span className='text-sm text-slate-500'>{date}</span>
                        </div>
                        {recommendedOffer
                            ? <TicketCard
                                offer={recommendedOffer}
                                mode={mode}
                                onReserve={reserveTicket}
                                reserving={bookingId === recommendedOffer.id}
                            />
                            : <div className='rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-slate-500'>暂无匹配班次，请调整出发地或目的地</div>
                        }
                    </section>

                    <section className='mt-5 rounded-lg bg-white border border-slate-200 p-5 shadow-sm'>
                        <div className='flex items-center justify-between gap-4'>
                            <h2 className='text-xl font-bold text-slate-950'>更多可选方案</h2>
                            <p className='text-sm text-slate-500'>在列表内部上下滑动比较时间、价格和余票成功率</p>
                        </div>
                        <div className='mt-4 max-h-[620px] overflow-y-auto rounded-lg bg-slate-50 p-3 pr-2'>
                            <div className='flex flex-col gap-3'>
                                {moreOffers.map(offer => (
                                    <TicketCard
                                        key={offer.id}
                                        offer={offer}
                                        mode={mode}
                                        compact
                                        onReserve={reserveTicket}
                                        reserving={bookingId === offer.id}
                                    />
                                ))}
                                {moreOffers.length === 0 &&
                                    <div className='rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center text-slate-500'>暂无更多可选方案</div>
                                }
                            </div>
                        </div>
                    </section>

                    <section className='mt-5 rounded-lg bg-white border border-slate-200 p-5 shadow-sm'>
                        <h2 className='text-xl font-bold text-slate-950'>比价提示</h2>
                        <div className='mt-4 grid grid-cols-3 gap-4'>
                            <div className='rounded-lg bg-blue-50 p-4'>
                                <p className='font-semibold text-blue-700'>价格实时性</p>
                                <p className='mt-2 text-sm text-slate-600'>当前展示的是可追溯历史样本，用于演示查询和下单，不代表实时销售价格。</p>
                            </div>
                            <div className='rounded-lg bg-orange-50 p-4'>
                                <p className='font-semibold text-orange-700'>优惠获取</p>
                                <p className='mt-2 text-sm text-slate-600'>铁路样本支持学生票筛选；后续可继续接入会员价和第三方平台价格。</p>
                            </div>
                            <div className='rounded-lg bg-emerald-50 p-4'>
                                <p className='font-semibold text-emerald-700'>后续扩展</p>
                                <p className='mt-2 text-sm text-slate-600'>每条票务记录来自后端数据库，来源链接可在价格下方打开核对。</p>
                            </div>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
};

export default TicketBooking;
