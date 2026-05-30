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
import {ApiRequests} from "../../core/apiConfig";
import {Location} from "../../core/domain/DomainInterfaces";
import {getCurrentUserId} from "../../core/currentUser";

type TicketMode = 'flight' | 'train';

type TicketBookingProps = {
    mode: TicketMode;
};

type TicketOffer = {
    id: string;
    departureTime: string;
    arrivalTime: string;
    duration: string;
    carrier: string;
    code: string;
    price: number;
    successRate: string;
    notice: string;
};

const modeConfig = {
    flight: {
        title: '机票订票与比价',
        eyebrow: '航班服务',
        icon: <Flight style={{fontSize: 18}}/>,
        fromLabel: '出发机场/城市',
        toLabel: '到达机场/城市',
        lowPrice: 420,
        highPrice: 1880,
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
        lowPrice: 80,
        highPrice: 780,
        codePrefix: 'G',
        hero: '筛选高铁、动车与普速列车',
        accent: '#0f766e',
    }
};

const today = new Date().toISOString().slice(0, 10);

const buildOffers = (mode: TicketMode, from?: Location, to?: Location): TicketOffer[] => {
    const config = modeConfig[mode];
    const fromName = from?.region ?? '上海虹桥';
    const toName = to?.region ?? '北京南';
    const seed = `${fromName}-${toName}-${mode}`.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);

    return Array.from({length: 9}).map((_, index) => {
        const hour = 7 + index * 2;
        const minute = (seed + index * 17) % 60;
        const priceRange = config.highPrice - config.lowPrice;
        const price = config.lowPrice + ((seed + index * 137) % priceRange);
        const durationHour = mode === 'flight' ? 2 + (index % 3) : 4 + (index % 5);
        const durationMinute = mode === 'flight' ? 10 + ((seed + index) % 40) : 20 + ((seed + index * 3) % 35);

        return {
            id: `${mode}-${index}-${seed}`,
            departureTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
            arrivalTime: `${String((hour + durationHour) % 24).padStart(2, '0')}:${String((minute + durationMinute) % 60).padStart(2, '0')}`,
            duration: `${durationHour}时${durationMinute}分`,
            carrier: mode === 'flight'
                ? ['中国国航', '东方航空', '南方航空', '海南航空'][index % 4]
                : ['高速动车', '动车组', '城际列车', '普通列车'][index % 4],
            code: `${config.codePrefix}${32 + index * 11}`,
            price,
            successRate: index < 3 ? '较高' : index < 6 ? '中等' : '较低',
            notice: index < 5 ? '余票紧张，建议尽快预订' : '可候补，成功率中等',
        };
    });
};

const TicketCard = ({
    offer,
    from,
    to,
    mode,
    compact = false,
    onReserve,
    reserving = false
}: {
    offer: TicketOffer,
    from?: Location,
    to?: Location,
    mode: TicketMode,
    compact?: boolean,
    onReserve?: (offer: TicketOffer) => void,
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
                    <p className='mt-1 text-sm font-semibold text-slate-800'>{from?.region ?? '上海虹桥'}</p>
                </div>
                <div className='flex-1 flex flex-col items-center text-slate-500'>
                    <p className='text-sm'>{offer.duration}</p>
                    <div className='my-2 flex flex-row items-center w-full gap-2'>
                        <div className='h-px bg-slate-300 flex-1'/>
                        <Chip size='small' label={offer.code} variant='outlined'/>
                        <div className='h-px bg-slate-300 flex-1'/>
                    </div>
                    <p className='text-xs'>{offer.carrier}</p>
                </div>
                <div className='w-28'>
                    <p className='text-3xl font-bold text-slate-900'>{offer.arrivalTime}</p>
                    <p className='mt-1 text-sm font-semibold text-slate-800'>{to?.region ?? '北京南'}</p>
                </div>
                <div className='w-32 text-right'>
                    <p className='text-sm text-slate-400'>含税参考价</p>
                    <p className='text-3xl font-bold text-orange-500'>¥{offer.price}</p>
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
    const [departures, setDepartures] = useState<Location[]>([]);
    const [arrivals, setArrivals] = useState<Location[]>([]);
    const [from, setFrom] = useState<Location | undefined>();
    const [to, setTo] = useState<Location | undefined>();
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

    const offers = useMemo(() => buildOffers(mode, from, to)
        .filter(offer => offer.price >= priceRange[0] && offer.price <= priceRange[1])
        .sort((a, b) => sortBy === 'price' ? a.price - b.price : a.departureTime.localeCompare(b.departureTime)), [mode, from, to, priceRange, sortBy]);
    const recommendedOffer = offers[0] ?? buildOffers(mode)[0];
    const moreOffers = offers.filter(offer => offer.id !== recommendedOffer.id);

    useEffect(() => {
        setLoading(true);
        setError(false);
        ApiRequests.getAvailableDestinations()
            .then(response => {
                const departureKey = mode === 'flight' ? 'plane' : 'train';
                const nextDepartures = response.data.departures?.[departureKey] ?? response.data.departures?.bus ?? [];
                const nextArrivals = response.data.arrivals ?? [];
                setDepartures(nextDepartures);
                setArrivals(nextArrivals);
                setFrom(nextDepartures[0]);
                setTo(nextArrivals[0]);
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

    const reserveTicket = async (offer: TicketOffer) => {
        setBookingId(offer.id);
        setBookingError(false);
        setBookingMessage('');

        try {
            const response = await ApiRequests.createTicketReservation({
                userId: getCurrentUserId(),
                transportType: mode === 'flight' ? 'FLIGHT' : 'TRAIN',
                routeFrom: from?.region ?? '出发地',
                routeTo: to?.region ?? '目的地',
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
                        <Chip icon={<ArrowForward/>} label={`${from?.region ?? '-'} 到 ${to?.region ?? '-'}`}/>
                        <Chip icon={<Tune/>} label={`${offers.length} 个方案`}/>
                    </div>
                </div>
            </div>

            {error && <Alert severity='warning' className='mb-4'>后端地点数据暂时不可用，页面已保留示例方案用于预览。</Alert>}
            {bookingError && <Alert severity='error' className='mb-4'>创建预订失败，请确认后端服务已启动。</Alert>}
            {bookingMessage && <Alert severity='success' className='mb-4'>{bookingMessage}</Alert>}

            <div className='grid grid-cols-[360px_1fr] gap-6 items-start'>
                <aside className='sticky top-24 self-start flex max-h-[calc(100vh-7rem)] flex-col gap-5 overflow-y-auto pr-1'>
                    <section className='rounded-lg bg-white border border-slate-200 p-5 shadow-sm'>
                        <h2 className='text-lg font-bold text-slate-900 mb-4'>查询行程</h2>
                        <div className='grid grid-cols-[1fr_44px_1fr] items-center gap-2'>
                            <FormControl fullWidth size='small'>
                                <InputLabel>{config.fromLabel}</InputLabel>
                                <Select value={from?.idLocation ?? ''} label={config.fromLabel} onChange={event => setFrom(departures.find(item => item.idLocation === event.target.value))}>
                                    {departures.map(item => <MenuItem key={item.idLocation} value={item.idLocation}>{item.region}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <Button onClick={swapLocations} variant='outlined' sx={{minWidth: 44, height: 40, borderRadius: 2}}>
                                <SwapHoriz/>
                            </Button>
                            <FormControl fullWidth size='small'>
                                <InputLabel>{config.toLabel}</InputLabel>
                                <Select value={to?.idLocation ?? ''} label={config.toLabel} onChange={event => setTo(arrivals.find(item => item.idLocation === event.target.value))}>
                                    {arrivals.map(item => <MenuItem key={item.idLocation} value={item.idLocation}>{item.region}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </div>
                        <label className='block mt-5 text-sm font-semibold text-slate-700'>
                            出行日期
                            <input className='mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900' type='date' value={date} onChange={event => setDate(event.target.value)}/>
                        </label>
                        <Button fullWidth variant='contained' size='large' startIcon={<Search/>} sx={{mt: 2, borderRadius: 2}}>
                            查询
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
                        <TicketCard
                            offer={recommendedOffer}
                            from={from}
                            to={to}
                            mode={mode}
                            onReserve={reserveTicket}
                            reserving={bookingId === recommendedOffer.id}
                        />
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
                                        from={from}
                                        to={to}
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
                                <p className='mt-2 text-sm text-slate-600'>票价会随余票和供应商变化，确认页以前端刷新结果为准。</p>
                            </div>
                            <div className='rounded-lg bg-orange-50 p-4'>
                                <p className='font-semibold text-orange-700'>优惠获取</p>
                                <p className='mt-2 text-sm text-slate-600'>后续可接入优惠券、学生票、会员价和第三方平台价格。</p>
                            </div>
                            <div className='rounded-lg bg-emerald-50 p-4'>
                                <p className='font-semibold text-emerald-700'>后续扩展</p>
                                <p className='mt-2 text-sm text-slate-600'>这里可以继续接入真实余票接口和订单锁票流程。</p>
                            </div>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
};

export default TicketBooking;
