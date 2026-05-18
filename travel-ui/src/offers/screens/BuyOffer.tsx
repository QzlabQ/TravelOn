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
            userId: uuidv4(),

            hotelName: hotelName,
            roomReservationsNames: selectedRooms.map(room => room.name),
            locationFromNameRegionAndCountry: selectedTransport.transportCourse.departureFromLocation.region + ', Polska',
            locationToNameRegionAndCountry: selectedTransport.transportCourse.arrivalAtLocation.region + ', ' + selectedTransport.transportCourse.arrivalAtLocation.country,
            transportType: selectedTransport.transportCourse.type === 'PLANE' ? TransportType.Samolot : TransportType.Bus,
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
            <p className='text-xl mb-6'>Szczegóły oferty</p>

            <div className='flex flex-col gap-3 mb-12'>
                <h3>Hotel</h3>
                <div className='flex flex-row items-center gap-3 ml-4 mb-4'>
                    <p>{hotelName}</p>
                    <p className='text-xs'>{idHotel}</p>
                </div>

                <p className='mb-4'>{formatDate(selectedDateFrom)} - {formatDate(selectedDateTo)}</p>

                <div>
                    <h3>Podróżni:</h3>
                    <p className='ml-4'>Dorośli {selectedGuests.adults}</p>
                    <p className='ml-4'>Nastolatkowie {selectedGuests.teens}</p>
                    <p className='ml-4'>Dzieci {selectedGuests.kids}</p>
                    <p className='ml-4'>Noworodki {selectedGuests.infants}</p>
                </div>
                <div>
                    <p>Pokoje</p>
                    {selectedRooms.map((item, index) => (
                        <div key={index} className='flex flex-row gap-3 items-center ml-4'>
                            <p>{item.name}</p>
                            <h3 className='text-xs'>{item.roomId}</h3>
                        </div>
                    ))}
                </div>

                <div>
                    <h3>Transport</h3>

                    <div className='flex flex-row gap-3 items-center ml-4'>
                        <p>{selectedTransport.transportCourse.type === 'PLANE' ? 'Samolot' : 'Bus'}</p>
                        <p>z: {selectedTransport.transportCourse.departureFromLocation.region}</p>
                        <p>do: {selectedTransport.transportCourse.arrivalAtLocation.region}, {selectedTransport.transportCourse.arrivalAtLocation.country}</p>
                        <p className='text-xs'>{selectedTransport.idTransport}</p>
                    </div>

                    <div className='flex flex-row gap-3 items-center ml-4'>
                        <p>{selectedReturnTransport.transportCourse.type === 'PLANE' ? 'Samolot' : 'Bus'}</p>
                        <p>z: {selectedReturnTransport.transportCourse.departureFromLocation.region}, {selectedReturnTransport.transportCourse.departureFromLocation.country}</p>
                        <p>do: {selectedReturnTransport.transportCourse.arrivalAtLocation.region}</p>
                        <p className='text-xs'>{selectedReturnTransport.idTransport}</p>
                    </div>
                </div>

                <div className='flex flex-col gap-3'>
                    <h3>Cena całkowita</h3>
                    <p className='font-semibold'>{price.toLocaleString().replace(',', ' ')} zł</p>
                </div>

            </div>

            {(transactionSuccessful === 'NOT_STARTED') &&
                <div className='mb-4'>
                    <Button variant='contained' startIcon={<Bookmark/>} onClick={() => {
                        reserveOfferRequest().then(r => r);
                        setTransactionSuccessful('IN_PROGRESS');
                    }}>
                        Rezerwacja
                    </Button>
                </div>
            }

            {transactionSuccessful === 'IN_PROGRESS' &&
                <div className='flex flex-col gap-3'>
                    <p>Czas na zakup rezerwacji:</p>
                    <Countdown
                        date={Date.now() + 60000}
                        onComplete={() => {
                            setTransactionSuccessful('ENDED');
                        }}
                    />

                    <div className='flex flex-row gap-3'>
                        <Button variant='contained' startIcon={<CreditCard/>} onClick={() => payForReservation(true)}>
                            Zapłać kartą poprawnie
                        </Button>
                        <Button variant='contained' startIcon={<CreditCard/>} color='error' onClick={() => payForReservation(false)}>
                            Zapłać kartą niepoprawnie
                        </Button>
                    </div>
                </div>
            }

            {transactionSuccessful === 'ENDED' &&
                <div>
                    <p className='text-xl mt-2 text-red-500'>Czas transakcji się skończył!</p>

                    <div className='mt-4'>
                        <Button
                            className='mt-4'
                            variant='contained'
                            startIcon={<ArrowBack/>}
                            onClick={() => navigate('/')}
                        >
                            Powrót do strony głównej
                        </Button>
                    </div>
                </div>
            }

            {transactionSuccessful === 'SUCCESS' &&
                <div>
                    <p className='text-xl mt-2 text-green-400'>Transakcja zakończona pomyślnie</p>
                    <p>Zarezerwowano wybraną podróż!</p>

                    <div className='mt-4'>
                        <Button
                            className='mt-4'
                            variant='contained'
                            startIcon={<ArrowBack/>}
                            onClick={() => navigate('/')}
                        >
                            Powrót do strony głównej
                        </Button>
                    </div>
                </div>
            }

            {transactionSuccessful === 'FAILURE' &&
                <div>
                    <p className='text-xl mt-2 text-red-400'>Transakcja zakończona niepomyślnie</p>
                    <p>Nie masz środków na karcie lub skończył się czas na płatność</p>

                    <div className='mt-4'>
                        <Button
                            className='mt-4'
                            variant='contained'
                            startIcon={<ArrowBack/>}
                            onClick={() => navigate('/')}
                        >
                            Powrót do strony głównej
                        </Button>
                    </div>
                </div>
            }

            {transactionSuccessful === 'BACKEND_FAILURE' &&
                <div>
                    <p className='text-xl mt-2 text-red-400'>Transakcja zakończona niepomyślnie</p>
                    <p>Nie udało się znaleźć wolnych zasobów aby zarezerwować ofertę</p>

                    <div className='mt-4'>
                        <Button
                            className='mt-4'
                            variant='contained'
                            startIcon={<ArrowBack/>}
                            onClick={() => navigate('/')}
                        >
                            Powrót do strony głównej
                        </Button>
                    </div>
                </div>
            }
        </div>
    );
}

export default BuyOffer;
