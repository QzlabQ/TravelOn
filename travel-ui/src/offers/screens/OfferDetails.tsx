import {Link, useLocation} from "react-router-dom";
import {
    Alert,
    Box,
    Button,
    CardMedia,
    Checkbox,
    FormControlLabel,
    IconButton,
    LinearProgress,
    Paper,
    Typography
} from "@mui/material";
import React, {useEffect, useRef, useState} from "react";
import {
    Add,
    ArrowBack,
    AttachMoney,
    Bookmark,
    Close,
    DirectionsBus,
    Flight,
    Lens,
    Money,
    Place,
    Remove
} from "@mui/icons-material";
import { useNavigate } from 'react-router-dom';
import {ApiRequests} from "../../core/apiConfig";
import {CateringOption, Location, Offer, Room, RoomConfiguration, Transport} from "../../core/domain/DomainInterfaces";
import {cateringToString, formatDate} from "../../core/utils";
import LoginIcon from "@mui/icons-material/Login";
import {DatePicker} from "@mui/x-date-pickers";
import dayjs from "dayjs";
import StarIcon from "@mui/icons-material/Star";
import Snackbar from "@mui/material/Snackbar";

// @ts-ignore
const OfferDetails = () => {

    const location = useLocation();

    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [unObtrusiveLoading, setUnObtrusiveLoading] = useState(1);

    const [offerDetails, setOfferDetails] = useState<Offer>({
        idHotel: location.state.idHotel,
        hotelName: location.state.hotelName,
        description: '',
        price: 0.0,
        destination: {idLocation: '', region: '', country: ''},
        imageUrls: [],

        roomConfiguration: {
            rooms: [],
            pricePerAdult: 0,
        },
        possibleRoomConfigurations: [{
            rooms: [],
            pricePerAdult: 0,
        }],

        cateringOptions: [],

        departure: [{idTransport: '', departureDate: new Date(), capacity: 0, pricePerAdult: 0,
            transportCourse: {idTransportCourse: '', type: 'PLANE', arrivalAtLocation: {idLocation: '', region: '', country: ''}, departureFromLocation: {idLocation: '', region: '', country: ''}}},
            {idTransport: '', departureDate: new Date(), capacity: 0, pricePerAdult: 0,
                transportCourse: {idTransportCourse: '', type: 'PLANE', arrivalAtLocation: {idLocation: '', region: '', country: ''}, departureFromLocation: {idLocation: '', region: '', country: ''}}}],
        possibleDepartures: [[], []],
    });

    const [selectedGuests, setSelectedGuests] = useState({
        adults: 2,
        teens: 0,
        kids: 0,
        infants: 0,
    });

    const [selectedDateFrom, setSelectedDateFrom] = useState(new Date(2024, 4, 1,));
    const [selectedDateTo, setSelectedDateTo] = useState(() => new Date(2024, 4, 3));

    const [selectedRooms, setSelectedRooms] = useState<RoomConfiguration>({
        rooms: [],
        pricePerAdult: 0,
    });
    const [selectedCatering, setSelectedCatering] = useState<CateringOption>({
        idCateringOption: '',
        type: 'ALL_INCLUSIVE',
        rating: 0,
        price: 0
    });

    const [selectedTransport, setSelectedTransport] = useState<Transport>(
        {idTransport: '', departureDate: new Date(), capacity: 0, pricePerAdult: 0,
            transportCourse: {idTransportCourse: '', type: 'PLANE', arrivalAtLocation: {idLocation: '', region: '', country: ''}, departureFromLocation: {idLocation: '', region: '', country: ''}}},
    );
    const [selectedReturnTransport, setSelectedReturnTransport] = useState<Transport>(
        {idTransport: '', departureDate: new Date(), capacity: 0, pricePerAdult: 0,
            transportCourse: {idTransportCourse: '', type: 'PLANE', arrivalAtLocation: {idLocation: '', region: '', country: ''}, departureFromLocation: {idLocation: '', region: '', country: ''}}},
    );

    const onRoomSelection = (roomConfiguration: any) => {
        setSelectedRooms(roomConfiguration);
    }

    const onCateringSelection = (cateringOption: CateringOption) => {
        setSelectedCatering(cateringOption);
    }

    const onTransportSelection = (transport: Transport, returnTransport: Transport) => {
        setSelectedTransport(transport);
        setSelectedReturnTransport(returnTransport);
    }

    const onGuestsSelection = (key: 'adults' | 'teens' | 'kids' | 'infants', type: 'INC' | 'DEC') => {
        setSelectedGuests(prevState => {
            const newState = { ...prevState };
            if (type === 'INC') {
                newState[key] = (prevState[key] || 0) + 1;
            } else {
                if (prevState[key] > 0) {
                    newState[key] = prevState[key] - 1;
                }
            }
            return newState;
        });
    }

    const onDateSelection = (date: Date, type: 'FROM' | 'TO') => {
        if (type === 'FROM') {
            setSelectedDateFrom(date);
        }
        else {
            setSelectedDateTo(date);
        }
    }

    const loadDataFromStorage = () => {
        const searchParams = JSON.parse(localStorage.getItem("searchParams") ?? '{}');

        setSelectedGuests({
            adults: searchParams.adults,
            teens: searchParams.teens,
            kids: searchParams.kids,
            infants: searchParams.infants,
        });
        setSelectedDateFrom(new Date(searchParams.dateFrom));
        setSelectedDateTo(new Date(searchParams.dateTo));
    }

    // @ts-ignore
    const [priceWebSocket, setPriceWebSocket] = useState<WebSocket>(null);

    // @ts-ignore
    const [detailsWebSocket, setDetailsWebSocket] = useState<WebSocket>(null);

    const requestOfferDetails = () => {
        if (offerDetails.cateringOptions[0]) {
            setUnObtrusiveLoading(prevState => prevState + 1);
            const searchParams = JSON.parse(localStorage.getItem("searchParams") ?? '{}');

            const requestOfferDetailsDto = {
                idHotel: offerDetails.idHotel,
                departurePlanes: searchParams.departurePlane ? searchParams.departurePlane.map((dpt: Location) => dpt.idLocation) : [],
                departureBuses: searchParams.departureBus ? searchParams.departureBus.map((dpt: Location) => dpt.idLocation) : [],
                dateFrom: formatDate(selectedDateFrom),
                dateTo: formatDate(selectedDateTo),
                adults: selectedGuests.adults,
                teens: selectedGuests.teens,
                kids: selectedGuests.kids,
                infants: selectedGuests.infants,
            }

            detailsWebSocket.send(JSON.stringify(requestOfferDetailsDto));
        }
    }

    useEffect(() => {
        const offerDetailsWS = new WebSocket(`ws://${process.env.REACT_APP_API_HOSTNAME}:${process.env.REACT_APP_API_PORT}/offers/ws/offerDetails?idHotel=${offerDetails.idHotel}`);

        offerDetailsWS.onopen = () => {
            setLoading(true);
            const searchParams = JSON.parse(localStorage.getItem("searchParams") ?? '{}');

            const requestOfferDetailsDto = {
                idHotel: offerDetails.idHotel,
                departurePlanes: searchParams.departurePlane ? searchParams.departurePlane.map((dpt: Location) => dpt.idLocation) : [],
                departureBuses: searchParams.departureBus ? searchParams.departureBus.map((dpt: Location) => dpt.idLocation) : [],
                dateFrom: formatDate(searchParams.dateFrom ? new Date(searchParams.dateFrom) : new Date()),
                dateTo: formatDate(searchParams.dateFrom ? new Date(searchParams.dateTo) : new Date()),
                adults: searchParams.adults,
                teens: searchParams.teens,
                kids: searchParams.kids,
                infants: searchParams.infants,
            }

            offerDetailsWS.send(JSON.stringify(requestOfferDetailsDto));
        }

        offerDetailsWS.onmessage = (ev) => {
            const recvOfferDetails = JSON.parse(ev.data);

            if (recvOfferDetails.dataGeneratorUpdate) {
                setSnackbarMessage("Organizator wycieczek zaktualizował swoją ofertę, odświeżam aktualnie wyświetlaną wycieczkę");
                setSnackbarOpen(true);
            }

            setOfferDetails(recvOfferDetails);
            setSelectedRooms(recvOfferDetails.roomConfiguration);
            setSelectedTransport(recvOfferDetails.departure[0]);
            setSelectedReturnTransport(recvOfferDetails.departure[1]);
            setSelectedCatering(recvOfferDetails.cateringOptions[0]);

            if (!recvOfferDetails.dataGeneratorUpdate) {
                setLoading(false);
                setUnObtrusiveLoading(prevState => prevState - 1);
            }
        }

        const priceWS = new WebSocket(`ws://${process.env.REACT_APP_API_HOSTNAME}:${process.env.REACT_APP_API_PORT}/offers/ws/offerPrice`);

        priceWS.onmessage = (ev) => {
            setFinalPrice(Math.ceil(ev.data));
        }

        setPriceWebSocket(priceWS);
        setDetailsWebSocket(offerDetailsWS);

        loadDataFromStorage();

        return () => {
            offerDetailsWS.close();
            priceWS.close();
        }
    }, []);

    const [finalPrice, setFinalPrice] = useState(0);

    useEffect(() => {
        const requestPriceDto = {
            dateFrom: formatDate(selectedDateFrom),
            dateTo: formatDate(selectedDateTo),
            adults: selectedGuests.adults,
            teens: selectedGuests.teens,
            kids: selectedGuests.kids,
            infants: selectedGuests.infants,

            roomConfiguration: selectedRooms,
            cateringOption: selectedCatering,
            departure: [selectedTransport, selectedReturnTransport],
        }

        if (offerDetails.cateringOptions[0]) {
            priceWebSocket.send(JSON.stringify(requestPriceDto));
        }
    }, [selectedRooms, selectedTransport, selectedCatering, selectedGuests, offerDetails, selectedDateTo, selectedDateFrom]);

    useEffect(() => {
        requestOfferDetails();
    }, [selectedDateTo, selectedDateFrom, selectedGuests]);

    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');

    useEffect(() => {

        const ws = new WebSocket(`ws://${process.env.REACT_APP_API_HOSTNAME}:${process.env.REACT_APP_API_PORT}/reservations/ws/offerBought?idHotel=${offerDetails.idHotel}`);

        ws.onmessage = (event) => {
            setSnackbarMessage(event.data);
            setSnackbarOpen(true);
        }

        return () => {
            ws.close();
        }
    }, []);

    return(
        <div>
            {unObtrusiveLoading !== 0 &&
                <div className='sticky top-0'>
                    <Box sx={{height: 10}}>
                        <LinearProgress/>
                    </Box>
                </div>
            }

            {!loading &&
                <div className='flex flex-row justify-around px-96'>
                    <div className='flex flex-1 flex-col py-16 mx-8 justify-center'>
                        <div className='flex flex-row items-center mb-6 hover:text-gray-700 hover:cursor-pointer'
                             onClick={() => navigate(-1)}>
                            <ArrowBack style={{fontSize: 20}}/>
                            <p className='ml-1'>Powrót do ofert</p>
                        </div>
                        <div className='flex flex-row items-center justify-between mb-8'>
                            <Paper style={{borderRadius: 8}} elevation={2}>
                                <CardMedia
                                    component="img"
                                    className='rounded-lg pointer-events-none'
                                    sx={{width: 720, height: 360}}
                                    image={offerDetails.imageUrls ? offerDetails.imageUrls.at(0) : ''}
                                />
                            </Paper>
                        </div>

                        <div className='flex flex-col gap-2 mb-8'>
                            <div className='flex flex-row items-center'>
                                <Place style={{fontSize: 18}} className='group-hover:text-gray-700'/>
                                <h4 className='ml-1 group-hover:text-gray-700'>
                                    {offerDetails.destination.country + ', ' + offerDetails.destination.region ?? ''}
                                </h4>
                            </div>
                            <h1 className='text-4xl'>{offerDetails.hotelName ?? ''}</h1>
                        </div>

                        <div className='flex flex-col gap-3 mb-12'>
                            {offerDetails.description.split(/[.!]+/).map((item, index) => (
                                <p key={index}>{item}</p>
                            ))}
                        </div>

                        <div className='mb-12'>
                            <h3 className='text-2xl mb-2'>Galeria</h3>
                            <div className='grid gap-3'>
                                {offerDetails.imageUrls.slice(1, offerDetails.imageUrls.length).map((url, index) => (
                                    <CardMedia
                                        key={index}
                                        component="img"
                                        className='rounded-lg pointer-events-none'
                                        sx={{width: 720, height: 240}}
                                        image={url}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className='mb-8'>
                            <h3 className='text-2xl mb-2'>Konfiguracje pokoi</h3>

                            <div className='mb-6'>
                                <FormControlLabel className='select-none' control={
                                    <Checkbox
                                        checked={selectedRooms === offerDetails.roomConfiguration}
                                        onChange={() => {
                                            onRoomSelection(offerDetails.roomConfiguration)
                                        }}
                                    />
                                } label={'Konfiguracja 1'}/>

                                <div className='flex flex-col gap-2'>
                                    {offerDetails.roomConfiguration.rooms.map((room, index) => (
                                        <div key={index}>
                                            <h3 className='mb-1'>{room.name}</h3>
                                            <p className='text-xs'>{room.description}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className='flex flex-col gap-6'>
                                {offerDetails.possibleRoomConfigurations.map((item, index) => (
                                    <div key={index} className=''>
                                        <FormControlLabel className='select-none' control={
                                            <Checkbox
                                                checked={selectedRooms === item}
                                                onChange={() => {
                                                    onRoomSelection(item)
                                                }}
                                            />
                                        } label={'Konfiguracja ' + (index + 2)}/>

                                        <div className='flex flex-col gap-2'>
                                            {item.rooms.map((room, index) => (
                                                <div key={index}>
                                                    <h3 className='mb-1'>{room.name}</h3>
                                                    <p className='text-xs'>{room.description}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className='mb-8'>
                            <h3 className='text-2xl mb-2'>Katering</h3>
                            <div className=''>
                                {offerDetails.cateringOptions.map((item, index) => (
                                    <div key={index} className='flex flex-row gap-3'>
                                        <FormControlLabel className='select-none' control={
                                            <Checkbox
                                                checked={selectedCatering === item}
                                                onChange={() => {
                                                    onCateringSelection(item)
                                                }}
                                            />
                                        } label={cateringToString(item.type)}/>

                                        <Box sx={{display: 'flex', alignItems: 'center'}}>
                                            <StarIcon sx={{color: 'gold', mr: 0.5, fontSize: 20}}/>
                                            <p className='text-sm text-gray-600'>
                                                {item.rating}
                                            </p>
                                        </Box>
                                    </div>
                                ))}
                            </div>
                        </div>


                    </div>
                    <div className='px-8 mt-28'>
                        <Paper className='sticky top-16 px-8 py-8 rounded-lg' elevation={1}>
                            {/* dates */}
                            <div className='flex flex-col gap-4 mb-4'>

                                <DatePicker
                                    label="Wyjazd"
                                    value={dayjs(selectedDateFrom)}
                                    onChange={(value) => onDateSelection(value ? value.toDate() : new Date(), 'FROM')}
                                />

                                <DatePicker
                                    label="Powrót"
                                    value={dayjs(selectedDateTo)}
                                    onChange={(value) => onDateSelection(value ? value.toDate() : new Date(), 'TO')}
                                />
                            </div>

                            {/* people selection */}
                            <div className='flex flex-col pl-2 mb-4'>
                                <div className='flex items-center justify-between gap-6'>
                                    <Typography className='select-none'>Dorośli</Typography>
                                    <div className='flex items-center'>
                                        <IconButton onClick={() => onGuestsSelection('adults', 'DEC')}>
                                            <Remove/>
                                        </IconButton>
                                        <Typography className='select-none'>{selectedGuests.adults}</Typography>
                                        <IconButton onClick={() => onGuestsSelection('adults', 'INC')}>
                                            <Add/>
                                        </IconButton>
                                    </div>
                                </div>
                                <div className='flex items-center justify-between gap-6'>
                                    <Typography className='select-none'>Nastolatkowie</Typography>
                                    <div className='flex items-center'>
                                        <IconButton onClick={() => onGuestsSelection('teens', 'DEC')}>
                                            <Remove/>
                                        </IconButton>
                                        <Typography className='select-none'>{selectedGuests.teens}</Typography>
                                        <IconButton onClick={() => onGuestsSelection('teens', 'INC')}>
                                            <Add/>
                                        </IconButton>
                                    </div>
                                </div>
                                <div className='flex items-center justify-between gap-6'>
                                    <Typography className='select-none'>Dzieci</Typography>
                                    <div className='flex items-center'>
                                        <IconButton onClick={() => onGuestsSelection('kids', 'DEC')}>
                                            <Remove/>
                                        </IconButton>
                                        <Typography className='select-none'>{selectedGuests.kids}</Typography>
                                        <IconButton onClick={() => onGuestsSelection('kids', 'INC')}>
                                            <Add/>
                                        </IconButton>
                                    </div>
                                </div>
                                <div className='flex items-center justify-between gap-6'>
                                    <Typography className='select-none'>Noworodki</Typography>
                                    <div className='flex items-center'>
                                        <IconButton onClick={() => onGuestsSelection('infants', 'DEC')}>
                                            <Remove/>
                                        </IconButton>
                                        <Typography className='select-none'>{selectedGuests.infants}</Typography>
                                        <IconButton onClick={() => onGuestsSelection('infants', 'INC')}>
                                            <Add/>
                                        </IconButton>
                                    </div>
                                </div>
                            </div>

                            {offerDetails.price >= 0 &&
                                <div className='mb-6'>
                                    <h3>Wylot / wyjazd</h3>

                                    <div className='flex flex-row gap-1 items-center'>
                                        <FormControlLabel className='select-none' control={
                                            <Checkbox
                                                checked={selectedTransport === offerDetails.departure[0]}
                                                onChange={() => {
                                                    onTransportSelection(offerDetails.departure[0], offerDetails.departure[1])
                                                }}
                                            />
                                        }
                                                          label={offerDetails.departure[0].transportCourse.departureFromLocation.region}/>

                                        {offerDetails.departure[0].transportCourse.type === 'PLANE' &&
                                            <Flight style={{fontSize: 16}}/>
                                        }
                                        {offerDetails.departure[0].transportCourse.type === 'BUS' &&
                                            <DirectionsBus style={{fontSize: 16}}/>
                                        }
                                    </div>


                                    <div className='flex flex-col mb-2'>
                                        {offerDetails.possibleDepartures[0].map((item, index) => (
                                            <div key={index} className='flex flex-row gap-1 items-center'>
                                                <FormControlLabel className='select-none' control={
                                                    <Checkbox
                                                        checked={selectedTransport === item}
                                                        onChange={() => {
                                                            onTransportSelection(item, offerDetails.possibleDepartures[1][index])
                                                        }}
                                                    />
                                                } label={item.transportCourse.departureFromLocation.region}/>

                                                {item.transportCourse.type === 'PLANE' &&
                                                    <Flight style={{fontSize: 16, marginRight: 6,}}/>
                                                }
                                                {item.transportCourse.type === 'BUS' &&
                                                    <DirectionsBus style={{fontSize: 16, marginRight: 6,}}/>
                                                }

                                                <p className='text-sm'>
                                                    + {Math.round((item.pricePerAdult + offerDetails.possibleDepartures[1][index].pricePerAdult) - (offerDetails.departure[0].pricePerAdult + offerDetails.departure[1].pricePerAdult))} zł
                                                    / os
                                                </p>
                                            </div>
                                        ))}
                                    </div>

                                    {finalPrice >= 0 && !unObtrusiveLoading &&
                                        <div className='flex flex-row gap-2'>
                                            <p>Cena:</p>
                                            <p>{finalPrice.toLocaleString().replace(',', ' ')} zł</p>
                                        </div>
                                    }
                                </div>
                            }

                            <Link to='/buyOffer' state={{
                                idHotel: offerDetails.idHotel,
                                price: finalPrice,
                                hotelName: offerDetails.hotelName,
                                selectedDateFrom: selectedDateFrom,
                                selectedDateTo: selectedDateTo,
                                selectedRooms: selectedRooms.rooms,
                                selectedTransport: selectedTransport,
                                selectedReturnTransport: selectedReturnTransport,
                                selectedGuests: selectedGuests,
                                selectedCatering: selectedCatering,
                            }}>
                                {finalPrice >= 0 && offerDetails.price >= 0 && selectedDateTo >= selectedDateFrom && !unObtrusiveLoading &&
                                    <Button variant='contained' startIcon={<Bookmark/>}>
                                        Zarezerwuj i kup ofertę
                                    </Button>
                                }
                            </Link>

                            {(finalPrice < 0 || offerDetails.price < 0 || selectedDateTo < selectedDateFrom) &&
                                <div className='flex flex-col'>
                                    <p className='text-red-500 text-wrap'>Konfiguracja niedostępna</p>
                                </div>
                            }
                        </Paper>
                    </div>

                    <Snackbar
                        open={snackbarOpen}
                        anchorOrigin={{vertical: 'top', horizontal: 'right'}}
                        autoHideDuration={8000}
                        onClose={() => {
                            setSnackbarOpen(false)
                        }}
                        style={{
                            marginTop: 64,
                        }}
                    >
                        <Alert
                            severity='info'
                            variant='standard'
                            onClose={() => {
                                setSnackbarOpen(false)
                            }}
                        >
                            {snackbarMessage}
                        </Alert>
                    </Snackbar>
                </div>
            }
        </div>

    );
}

export default OfferDetails;
