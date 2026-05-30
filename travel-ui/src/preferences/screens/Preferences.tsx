import { Paper, TableContainer, Table, TableHead, TableBody, TableRow, TableCell } from "@mui/material";
import React, { useEffect, useState } from "react";
import {ConnectingAirports, Explore, Hotel, MeetingRoom} from "@mui/icons-material";

type Reservation = {
    hotelName: string;
    roomNames: string[];
    locationFromNameRegionAndCountry: string;
    locationToNameRegionAndCountry: string;
    transportType: string;
    reservationTime: string;
};

const localizeTransportType = (transportType: string) => {
    if (transportType === 'Samolot' || transportType === 'PLANE') return '飞机';
    if (transportType === 'Bus' || transportType === 'BUS') return '巴士';
    if (transportType === 'Pociag' || transportType === 'TRAIN') return '火车';
    return transportType;
};

const localizePlaceName = (placeName: string) => {
    return placeName.replaceAll('Polska', '波兰');
};

const Preferences = () => {
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [topHotels, setTopHotels] = useState<string[]>([]);
    const [topRoomTypes, setTopRoomTypes] = useState<{ room: string, hotel: string }[]>([]);
    const [topLocationNamesTo, setTopLocationNamesTo] = useState<string[]>([]);
    const [topTransportTypes, setTopTransportTypes] = useState<string[]>([]);

    useEffect(() => {
        const ws = new WebSocket(`ws://${process.env.REACT_APP_API_HOSTNAME}:${process.env.REACT_APP_API_PORT}/reservations/ws/reservationPreferences`);

        ws.onmessage = (event) => {
            console.log("Received message: " + event.data);

            const messageType = event.data.split(':')[0];

            switch (messageType) {
                case "SingleReservation":
                    const reservationData = event.data.split(': ')[1];
                    const reservation = JSON.parse(reservationData);

                    const newReservation = {
                        hotelName: reservation.hotelName,
                        roomNames: reservation.roomReservationsNames,
                        locationFromNameRegionAndCountry: reservation.locationFromNameRegionAndCountry,
                        locationToNameRegionAndCountry: reservation.locationToNameRegionAndCountry,
                        transportType: reservation.transportType,
                        reservationTime: reservation.reservationTime
                    };

                    setReservations(prevReservations => [newReservation, ...prevReservations]);
                    break;

                case "TopHotels":
                    const topHotels = event.data.split(':')[1].split('#').map((item: string) => item.trim());
                    setTopHotels(topHotels);
                    break;

                case "TopRoomTypes":
                    const topRoomTypes = event.data.split(':')[1].split('#').map((item: string) => {
                        const [hotel, room] = item.split(' - ').map(part => part.trim());
                        return { hotel, room };
                    });
                    setTopRoomTypes(topRoomTypes);
                    break;

                case "TopLocationNamesTo":
                    const topLocationNamesTo = event.data.split(':')[1].split('#').map((item: string) => item.trim());
                    setTopLocationNamesTo(topLocationNamesTo);
                    break;

                case "TopTransportTypes":
                    const topTransportTypes = event.data.split(':')[1].split('#').map((item: string) => item.trim());
                    setTopTransportTypes(topTransportTypes);
                    break;

                default:
                    console.log("Wrong type of message");
                    break;
            }
        };

        return () => {
            ws.close();
            console.error("WebSocket connection closed");
        };
    }, []);

    return (
        <div className='flex flex-col px-64 py-24'>
            <div className='grid grid-cols-2 grid-rows-2 gap-x-12 gap-y-8'>
                <Paper elevation={2} className='flex flex-col justify-center items-center rounded-xl px-4 py-6'>
                    <div className='mb-5 flex flex-row gap-2 items-center'>
                        <Explore style={{fontSize: 18}}/>
                        <h3 className='text-xl'>热门旅行目的地</h3>
                    </div>
                    <ul className='flex flex-col gap-3'>
                        {topLocationNamesTo.map((location, index) => (
                            <li key={index}>{location}</li>
                        ))}
                    </ul>
                </Paper>

                <Paper elevation={2} className='flex flex-col justify-center items-center rounded-xl px-4 py-6'>
                    <div className='mb-5 flex flex-row gap-2 items-center'>
                        <Hotel style={{fontSize: 18}}/>
                        <h3 className='text-xl'>热门酒店</h3>
                    </div>
                    <ul className='flex flex-col gap-3'>
                        {topHotels.map((hotel, index) => (
                            <li key={index}>{hotel}</li>
                        ))}
                    </ul>
                </Paper>

                <Paper elevation={2} className='flex flex-col justify-center items-center rounded-xl px-4 py-6'>
                    <div className='mb-5 flex flex-row gap-2 items-center'>
                        <MeetingRoom style={{fontSize: 18}}/>
                        <h3 className='text-xl'>热门房型</h3>
                    </div>
                    <ul className='flex flex-col gap-3'>
                        {topRoomTypes.map((roomType, index) => (
                            <li key={index}>
                                <p>{roomType.room}</p>
                                <p className='text-xs ml-4'>{roomType.hotel}</p>
                            </li>
                        ))}
                    </ul>
                </Paper>

                <Paper elevation={2} className='flex flex-col justify-center items-center rounded-xl px-4 py-6'>
                    <div className='mb-5 flex flex-row gap-2 items-center'>
                        <ConnectingAirports style={{fontSize: 18}}/>
                        <h3 className='text-xl'>热门交通类型</h3>
                    </div>
                    <ul className='flex flex-col gap-3'>
                        {topTransportTypes.map((transportType, index) => (
                            <li key={index}>{transportType}</li>
                        ))}
                    </ul>
                </Paper>

                <div className='mt-8 col-span-2'>
                    <h2 className='text-xl font-bold mb-4'>最新预订</h2>
                    <Paper elevation={3}>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell className='border border-gray-300 p-2'>日期和时间</TableCell>
                                        <TableCell className='border border-gray-300 p-2'>酒店</TableCell>
                                        <TableCell className='border border-gray-300 p-2'>房间</TableCell>
                                        <TableCell className='border border-gray-300 p-2'>出发地</TableCell>
                                        <TableCell className='border border-gray-300 p-2'>目的地</TableCell>
                                        <TableCell className='border border-gray-300 p-2'>交通类型</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {reservations.map((reservation, index) => (
                                        <TableRow key={index}>
                                            <TableCell className='border border-gray-300 p-2'>{reservation.reservationTime}</TableCell>
                                            <TableCell className='border border-gray-300 p-2'>{reservation.hotelName}</TableCell>
                                            <TableCell className='border border-gray-300 p-2'>{reservation.roomNames.join(', ')}</TableCell>
                                            <TableCell className='border border-gray-300 p-2'>{localizePlaceName(reservation.locationFromNameRegionAndCountry)}</TableCell>
                                            <TableCell className='border border-gray-300 p-2'>{localizePlaceName(reservation.locationToNameRegionAndCountry)}</TableCell>
                                            <TableCell className='border border-gray-300 p-2'>{localizeTransportType(reservation.transportType)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </div>
            </div>
        </div>
    );
}

export default Preferences;
