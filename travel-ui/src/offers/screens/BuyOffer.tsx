import React, {useEffect, useState} from "react";
import {useLocation, useNavigate} from "react-router-dom";
import Countdown from "react-countdown";
import {CateringOption, Location, Room, Transport} from "../../core/domain/DomainInterfaces";
import {ApiRequests} from "../../core/apiConfig";
import {Button} from "@mui/material";
import {ArrowBack, Book, Bookmark, Bookmarks, CreditCard} from "@mui/icons-material";
import {formatDate} from "../../core/utils";
import { TransportType } from "../../core/apiConfig";
import { v4 as uuidv4 } from 'uuid';
import LoginIcon from "@mui/icons-material/Login";
import {getCurrentUserId} from "../../core/currentUser";

const BuyOffer = () => {

    const location = useLocation();

    const navigate = useNavigate();

    const [idHotel, setIdHotel] = useState(location.state.idHotel);
    const [price, setPrice] = useState(location.state.price);
    const [hotelName, setHotelName] = useState(location.state.hotelName);
    const [selectedGuests, setSelectedGuests] = useState(location.state.selectedGuests);

    const [selectedDateFrom, setSelectedDateFrom] = useState(location.state.selectedDateFrom);
    const [selectedDateTo, setSelectedDateTo] = useState(location.state.selectedDateTo);

    const [selectedRooms, setSelectedRooms] = useState<Room[]>(location.state.selectedRooms);
    const [selectedCatering, setSelectedCatering] = useState<CateringOption>(location.state.selectedCatering);
    const [selectedTransport, setSelectedTransport] = useState<Transport>(location.state.selectedTransport);
    const [selectedReturnTransport, setSelectedReturnTransport] = useState<Transport>(location.state.selectedReturnTransport);

    const [transactionSuccessful, setTransactionSuccessful] = useState('NOT_STARTED');

    const [idReservation, setIdReservation] = useState('');

    const reserveOfferRequest = async () => {
        let searchParams = JSON.parse(localStorage.getItem("searchParams") ?? '{}');

        searchParams = {...searchParams,
            departurePlane: searchParams.departurePlane ? searchParams.departurePlane.map((dpt: Location) => dpt.idLocation) : [],
            departureBus: searchParams.departureBus ? searchParams.departureBus.map((dpt: Location) => dpt.idLocation) : [],
            departureTrain: searchParams.departureTrain ? searchParams.departureTrain.map((dpt: Location) => dpt.idLocation) : [],
            dateFrom: formatDate(searchParams.dateFrom ? new Date(searchParams.dateFrom) : new Date()),
            dateTo: formatDate(searchParams.dateFrom ? new Date(searchParams.dateTo) : new Date()),
        }

        await ApiRequests.reserveOffer({
            id: uuidv4(),
            hotelId: idHotel,

            hotelTimeFrom: selectedDateFrom,
            hotelTimeTo: selectedDateTo,

            adultsQuantity: selectedGuests.adults,
            childrenUnder18Quantity: selectedGuests.teens,
            childrenUnder10Quantity: selectedGuests.kids,
            childrenUnder3Quantity: selectedGuests.infants,

            price: price,

            roomReservationsIds: selectedRooms.map(room => room.roomId),
            transportReservationsIds: [selectedTransport.idTransport, selectedReturnTransport.idTransport],
            userId: getCurrentUserId(),

            hotelName: hotelName,
            roomReservationsNames: selectedRooms.map(room => room.name),
            locationFromNameRegionAndCountry: selectedTransport.transportCourse.departureFromLocation.region + ', Polska',
            locationToNameRegionAndCountry: selectedTransport.transportCourse.arrivalAtLocation.region + ', ' + selectedTransport.transportCourse.arrivalAtLocation.country,
            transportType: selectedTransport.transportCourse.type === 'PLANE' ? TransportType.Samolot : selectedTransport.transportCourse.type === 'TRAIN' ? TransportType.Pociag : TransportType.Bus,
        })
            .then(response => {

                if (response.data.includes('exception')) {
                    setTransactionSuccessful('BACKEND_FAILURE');
                    return;
                }

                setIdReservation(response.data.split(' ').at(3));
            })
            .catch(e => console.log(e));
    }

    const payForReservation = async (successful: boolean) => {
        await ApiRequests.payForReservation({
            reservationId: idReservation,
            cardNumber: ('123456781234567' + (successful ? '4' : '5'))
        })
            .then(response => {
                if (response.status === 200) {
                    setTransactionSuccessful('SUCCESS');
                    return;
                }
            }).catch(e => {
                setTransactionSuccessful('FAILURE');
            });
    }

    return (
        <div className='flex flex-col px-[32rem] py-16'>
            <p className='text-xl mb-6'>产品详情</p>

            <div className='flex flex-col gap-3 mb-12'>
                <h3>酒店</h3>
                <div className='flex flex-row items-center gap-3 ml-4 mb-4'>
                    <p>{hotelName}</p>
                    <p className='text-xs'>{idHotel}</p>
                </div>

                <p className='mb-4'>{formatDate(selectedDateFrom)} - {formatDate(selectedDateTo)}</p>

                <div>
                    <h3>旅客：</h3>
                    <p className='ml-4'>成人 {selectedGuests.adults}</p>
                    <p className='ml-4'>青少年 {selectedGuests.teens}</p>
                    <p className='ml-4'>儿童 {selectedGuests.kids}</p>
                    <p className='ml-4'>婴幼儿 {selectedGuests.infants}</p>
                </div>
                <div>
                    <p>房间</p>
                    {selectedRooms.map((item, index) => (
                        <div key={index} className='flex flex-row gap-3 items-center ml-4'>
                            <p>{item.name}</p>
                            <h3 className='text-xs'>{item.roomId}</h3>
                        </div>
                    ))}
                </div>

                <div>
                    <h3>交通</h3>

                    <div className='flex flex-row gap-3 items-center ml-4'>
                        <p>{selectedTransport.transportCourse.type === 'PLANE' ? '飞机' : selectedTransport.transportCourse.type === 'TRAIN' ? '火车' : '巴士'}</p>
                        <p>从：{selectedTransport.transportCourse.departureFromLocation.region}</p>
                        <p>到：{selectedTransport.transportCourse.arrivalAtLocation.region}, {selectedTransport.transportCourse.arrivalAtLocation.country}</p>
                        <p className='text-xs'>{selectedTransport.idTransport}</p>
                    </div>

                    <div className='flex flex-row gap-3 items-center ml-4'>
                        <p>{selectedReturnTransport.transportCourse.type === 'PLANE' ? '飞机' : selectedReturnTransport.transportCourse.type === 'TRAIN' ? '火车' : '巴士'}</p>
                        <p>从：{selectedReturnTransport.transportCourse.departureFromLocation.region}, {selectedReturnTransport.transportCourse.departureFromLocation.country}</p>
                        <p>到：{selectedReturnTransport.transportCourse.arrivalAtLocation.region}</p>
                        <p className='text-xs'>{selectedReturnTransport.idTransport}</p>
                    </div>
                </div>

                <div className='flex flex-col gap-3'>
                    <h3>总价</h3>
                    <p className='font-semibold'>{price.toLocaleString().replace(',', ' ')} 元</p>
                </div>

            </div>

            {(transactionSuccessful === 'NOT_STARTED') &&
                <div className='mb-4'>
                    <Button variant='contained' startIcon={<Bookmark/>} onClick={() => {
                        reserveOfferRequest().then(r => r);
                        setTransactionSuccessful('IN_PROGRESS');
                    }}>
                        预订
                    </Button>
                </div>
            }

            {transactionSuccessful === 'IN_PROGRESS' &&
                <div className='flex flex-col gap-3'>
                    <p>预订支付剩余时间：</p>
                    <Countdown
                        date={Date.now() + 60000}
                        onComplete={() => {
                            setTransactionSuccessful('ENDED');
                        }}
                    />

                    <div className='flex flex-row gap-3'>
                        <Button variant='contained' startIcon={<CreditCard/>} onClick={() => payForReservation(true)}>
                            使用有效银行卡支付
                        </Button>
                        <Button variant='contained' startIcon={<CreditCard/>} color='error' onClick={() => payForReservation(false)}>
                            使用无效银行卡支付
                        </Button>
                    </div>
                </div>
            }

            {transactionSuccessful === 'ENDED' &&
                <div>
                    <p className='text-xl mt-2 text-red-500'>交易时间已结束！</p>

                    <div className='mt-4'>
                        <Button
                            className='mt-4'
                            variant='contained'
                            startIcon={<ArrowBack/>}
                            onClick={() => navigate('/')}
                        >
                            返回首页
                        </Button>
                    </div>
                </div>
            }

            {transactionSuccessful === 'SUCCESS' &&
                <div>
                    <p className='text-xl mt-2 text-green-400'>交易成功完成</p>
                    <p>已预订所选行程！</p>

                    <div className='mt-4'>
                        <Button
                            className='mt-4'
                            variant='contained'
                            startIcon={<ArrowBack/>}
                            onClick={() => navigate('/')}
                        >
                            返回首页
                        </Button>
                    </div>
                </div>
            }

            {transactionSuccessful === 'FAILURE' &&
                <div>
                    <p className='text-xl mt-2 text-red-400'>交易未成功完成</p>
                    <p>银行卡余额不足，或支付时间已结束</p>

                    <div className='mt-4'>
                        <Button
                            className='mt-4'
                            variant='contained'
                            startIcon={<ArrowBack/>}
                            onClick={() => navigate('/')}
                        >
                            返回首页
                        </Button>
                    </div>
                </div>
            }

            {transactionSuccessful === 'BACKEND_FAILURE' &&
                <div>
                    <p className='text-xl mt-2 text-red-400'>交易未成功完成</p>
                    <p>未能找到可用资源来预订该产品</p>

                    <div className='mt-4'>
                        <Button
                            className='mt-4'
                            variant='contained'
                            startIcon={<ArrowBack/>}
                            onClick={() => navigate('/')}
                        >
                            返回首页
                        </Button>
                    </div>
                </div>
            }
        </div>
    );
}

export default BuyOffer;
