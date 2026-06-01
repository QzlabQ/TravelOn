import React, {useEffect, useState} from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    FormControl,
    InputLabel,
    LinearProgress,
    MenuItem,
    Rating,
    Select,
    TextField,
    ToggleButton,
    ToggleButtonGroup
} from "@mui/material";
import {Bed, Hotel, LocalOffer, Search, Star} from "@mui/icons-material";
import {Link} from "react-router-dom";
import {ApiRequests, GetOffersBySearchQueryOffer} from "../../core/apiConfig";
import {Location} from "../../core/domain/DomainInterfaces";
import {formatDate} from "../../core/utils";
import {getCurrentUserId} from "../../core/currentUser";

const today = new Date();
const nextDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

const HotelBooking = () => {
    const [destinations, setDestinations] = useState<Location[]>([]);
    const [destination, setDestination] = useState<Location | undefined>();
    const [dateFrom, setDateFrom] = useState(formatDate(today));
    const [dateTo, setDateTo] = useState(formatDate(nextDay));
    const [priceFrom, setPriceFrom] = useState('');
    const [priceTo, setPriceTo] = useState('');
    const [stars, setStars] = useState(0);
    const [hotelType, setHotelType] = useState('ALL');
    const [roomType, setRoomType] = useState('ALL');
    const [hotelNameQuery, setHotelNameQuery] = useState('');
    const [offers, setOffers] = useState<GetOffersBySearchQueryOffer[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [bookingHotelId, setBookingHotelId] = useState('');
    const [bookingMessage, setBookingMessage] = useState('');
    const [bookingError, setBookingError] = useState(false);

    const loadDestinations = async () => {
        setLoading(true);
        setError(false);
        try {
            const response = await ApiRequests.getAvailableDestinations();
            const arrivals = response.data.arrivals ?? [];
            setDestinations(arrivals);
            setDestination(arrivals[0]);
        } catch (e) {
            console.log(e);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    const searchHotels = async () => {
        setLoading(true);
        setError(false);
        try {
            if (!destination) return;

            const response = await ApiRequests.searchHotels({
                destinationId: destination.idLocation,
                dateFrom,
                dateTo,
                adults: 2,
            });
            setOffers(response.data.map(hotel => ({
                idHotel: hotel.hotelId,
                hotelName: hotel.name,
                description: hotel.description,
                price: hotel.pricePerAdult,
                destination: `${hotel.location.region}, ${hotel.location.country}`,
                rating: hotel.rating,
                imageUrl: hotel.photos[0] ?? '',
            })));
        } catch (e) {
            console.log(e);
            setError(true);
            setOffers([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDestinations().then(r => r);
    }, []);

    useEffect(() => {
        if (destinations.length > 0) {
            searchHotels().then(r => r);
        }
    }, [destination]);

    const normalizedPriceFrom = priceFrom.trim() === '' ? 0 : Number(priceFrom);
    const normalizedPriceTo = priceTo.trim() === '' ? Number.POSITIVE_INFINITY : Number(priceTo);
    const hasInvalidPriceRange = Number.isNaN(normalizedPriceFrom) ||
        Number.isNaN(normalizedPriceTo) ||
        normalizedPriceFrom < 0 ||
        normalizedPriceTo < 0 ||
        normalizedPriceFrom > normalizedPriceTo;

    const filteredOffers = offers
        .filter(offer => offer.hotelName.toLowerCase().includes(hotelNameQuery.trim().toLowerCase()))
        .filter(offer => hasInvalidPriceRange || (offer.price >= normalizedPriceFrom && offer.price <= normalizedPriceTo))
        .filter(offer => stars === 0 || offer.rating >= stars)
        .sort((a, b) => a.price - b.price);

    const visibleOffers = filteredOffers;

    const quickBookHotel = async (offer: GetOffersBySearchQueryOffer) => {
        setBookingHotelId(offer.idHotel);
        setBookingError(false);
        setBookingMessage('');

        try {
            const response = await ApiRequests.createHotelReservation({
                userId: getCurrentUserId(),
                hotelId: offer.idHotel,
                hotelName: offer.hotelName,
                dateFrom,
                dateTo,
                adultsQuantity: 2,
                childrenUnder3Quantity: 0,
                childrenUnder10Quantity: 0,
                childrenUnder18Quantity: 0,
                price: offer.price,
                roomName: roomType === 'DOUBLE' ? '大床房' : roomType === 'FAMILY' ? '家庭房' : '标准房',
            });
            setBookingMessage(`已创建酒店预订 ${response.data.id}，可到“我的预订”继续支付或取消。`);
        } catch (e) {
            console.log(e);
            setBookingError(true);
        } finally {
            setBookingHotelId('');
        }
    };

    return (
        <div className='min-h-screen bg-slate-50 px-8 py-8'>
            <div className='mb-6 rounded-lg bg-white border border-slate-200 px-7 py-6 shadow-sm'>
                <Chip icon={<Hotel/>} label='酒店服务' sx={{backgroundColor: '#eff6ff', color: '#2563eb'}}/>
                <div className='mt-4 flex flex-wrap items-end justify-between gap-4'>
                    <div>
                        <h1 className='text-3xl font-bold text-slate-950'>酒店预定</h1>
                        <p className='mt-2 text-slate-500'>按目的地、日期、星级和房型筛选可预订酒店</p>
                    </div>
                    <div className='flex gap-2'>
                        <Chip icon={<Bed/>} label={`${visibleOffers.length} 家酒店`}/>
                        <Chip icon={<Star/>} label={stars ? `${stars} 星以上` : '不限星级'}/>
                    </div>
                </div>
            </div>

            {error && <Alert severity='warning' className='mb-4'>后端酒店数据暂时不可用，请启动服务后重试。</Alert>}
            {bookingError && <Alert severity='error' className='mb-4'>创建酒店预订失败，请检查日期或后端服务。</Alert>}
            {bookingMessage && <Alert severity='success' className='mb-4'>{bookingMessage}</Alert>}

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
                        <FormControl fullWidth size='small'>
                            <InputLabel>住宿地</InputLabel>
                            <Select value={destination?.idLocation ?? ''} label='住宿地' onChange={event => setDestination(destinations.find(item => item.idLocation === event.target.value))}>
                                {destinations.map(item => <MenuItem key={item.idLocation} value={item.idLocation}>{item.region}, {item.country}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <label className='block mt-5 text-sm font-semibold text-slate-700'>
                            入住和离店日期
                            <div className='grid grid-cols-2 gap-3 mt-2'>
                                <input className='rounded-lg border border-slate-300 px-3 py-2 text-slate-900' type='date' value={dateFrom} onChange={event => setDateFrom(event.target.value)}/>
                                <input className='rounded-lg border border-slate-300 px-3 py-2 text-slate-900' type='date' value={dateTo} onChange={event => setDateTo(event.target.value)}/>
                            </div>
                        </label>
                        <Button fullWidth variant='contained' size='large' startIcon={<Search/>} sx={{mt: 2, borderRadius: 2}} onClick={searchHotels}>
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

                        <p className='mb-2 text-sm font-semibold text-slate-700'>星级</p>
                        <Rating value={stars} onChange={(_, value) => setStars(value ?? 0)}/>

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
                    </section>
                </aside>

                <main className='min-w-0'>
                    {loading && <Box sx={{height: 5}} className='mb-4'><LinearProgress/></Box>}
                    <section className='rounded-lg bg-white border border-slate-200 p-5 shadow-sm'>
                        <div className='flex items-center justify-between gap-4'>
                            <h2 className='text-xl font-bold text-slate-950'>酒店列表</h2>
                            <p className='text-sm text-slate-500'>选择酒店后进入详情页查看具体房型</p>
                        </div>
                        <div className='mt-4 max-h-[calc(100vh-16rem)] overflow-y-auto rounded-lg bg-slate-50 p-3 pr-2'>
                            {visibleOffers.map(offer => (
                                <HotelResultCard
                                    key={offer.idHotel}
                                    offer={offer}
                                    roomType={roomType}
                                    onBook={quickBookHotel}
                                    reserving={bookingHotelId === offer.idHotel}
                                />
                            ))}
                            {visibleOffers.length === 0 && !loading &&
                                <div className='py-16 text-center text-slate-500'>暂无匹配酒店</div>
                            }
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
};

const HotelResultCard = ({
    offer,
    roomType,
    onBook,
    reserving
}: {
    offer: GetOffersBySearchQueryOffer,
    roomType: string,
    onBook: (offer: GetOffersBySearchQueryOffer) => void,
    reserving: boolean
}) => (
    <section className='mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md'>
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
                <p className='text-xs text-orange-500'>历史展示参考价</p>
                <p className='mt-2 text-slate-400 line-through'>¥{Math.ceil(offer.price * 1.18).toLocaleString()}</p>
                <p className='text-3xl font-bold text-blue-600'>¥{Math.ceil(offer.price).toLocaleString()} <span className='text-sm'>起</span></p>
                <div className='mt-2 flex flex-col gap-2'>
                    <Button
                        variant='contained'
                        sx={{borderRadius: 2}}
                        startIcon={<LocalOffer/>}
                        disabled={reserving}
                        onClick={() => onBook(offer)}
                    >
                        {reserving ? '预订中' : '快速预订'}
                    </Button>
                    <Link to='/offerDetails' state={{idHotel: offer.idHotel, price: offer.price}}>
                        <Button fullWidth variant='outlined' sx={{borderRadius: 2}}>查看酒店</Button>
                    </Link>
                </div>
            </div>
        </div>
    </section>
);

export default HotelBooking;
