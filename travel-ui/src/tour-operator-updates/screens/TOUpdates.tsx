import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import { ConnectingAirports, Hotel } from "@mui/icons-material";
import React, { useEffect, useState } from "react";

type HotelUpdate = {
    updateDateTime: string;
    updateType: string;
    hotelName: string;
    roomName: string;
    priceChange: number;
    capacityChange: number;
};

type TransportUpdate = {
    updateDateTime: string;
    updateType: string;
    departureRegionAndCountry: string;
    arrivalRegionAndCountry: string;
    transportTypeName: string;
    priceChange: number;
    capacityChange: number;
};

const TOUpdates = () => {

    const [hotelUpdates, setHotelUpdates] = useState<HotelUpdate[]>([]);
    const [transportUpdates, setTransportUpdates] = useState<TransportUpdate[]>([]);

    useEffect(() => {
        const hotelWs = new WebSocket(`ws://${process.env.REACT_APP_API_HOSTNAME}:${process.env.REACT_APP_API_PORT}/data-generator/ws/hotel`);
        const transportWs = new WebSocket(`ws://${process.env.REACT_APP_API_HOSTNAME}:${process.env.REACT_APP_API_PORT}/data-generator/ws/transport`);

        hotelWs.onmessage = (event) => {
            console.log("Received hotel message: " + event.data);
        
            const messageType = event.data.split(':')[0];
            const messageData = event.data.split(': ')[1];
        
            switch (messageType) {
                case "SingleHotel":
                    const hotelUpdate = JSON.parse(messageData);
        
                    setHotelUpdates((prevUpdates) => [hotelUpdate, ...prevUpdates]);
                    break;
                default:
                    console.log("Unexpected message type");
                    break;
            }
        };

        transportWs.onmessage = (event) => {
            console.log("Received transport message: " + event.data);

            const messageType = event.data.split(':')[0];
            const messageData = event.data.split(': ')[1];

            switch (messageType) {
                case "SingleTransport":
                    const transportUpdate = JSON.parse(messageData);

                    setTransportUpdates((prevUpdates) => [transportUpdate, ...prevUpdates]);
                    break;
                default:
                    console.log("Unexpected message type");
                    break;
            }
        };

        return () => {
            hotelWs.close();
            transportWs.close();
            console.log("WebSocket connection closed");
        };
    }, []);

    return (
        <div className='flex flex-col px-16 py-24'>
            <div className='grid grid-cols-2 gap-6'>
                <Paper elevation={2} style={{height: 'fit-content'}}>
                    <div className='mt-4 mb-6 flex flex-row gap-2 items-center justify-center'>
                        <ConnectingAirports style={{fontSize: 18}}/>
                        <h3 className='text-xl'>Aktualizacje transportów</h3>
                    </div>

                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell className='border border-gray-300 p-2'>Data zmiany</TableCell>
                                    <TableCell className='border border-gray-300 p-2'>Skąd</TableCell>
                                    <TableCell className='border border-gray-300 p-2'>Dokąd</TableCell>
                                    <TableCell className='border border-gray-300 p-2'>Typ transportu</TableCell>
                                    <TableCell className='border border-gray-300 p-2'>Typ zmiany</TableCell>
                                    <TableCell className='border border-gray-300 p-2'>Zmiany</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {transportUpdates.map((transport, index) => (
                                    <TableRow key={index}>
                                        <TableCell className='border border-gray-300 p-2'>{new Date(transport.updateDateTime).toLocaleString()}</TableCell>
                                        <TableCell className='border border-gray-300 p-2'>{transport.departureRegionAndCountry}</TableCell>
                                        <TableCell className='border border-gray-300 p-2'>{transport.arrivalRegionAndCountry}</TableCell>
                                        <TableCell className='border border-gray-300 p-2'>{transport.transportTypeName}</TableCell>
                                        <TableCell className='border border-gray-300 p-2'>{transport.updateType}</TableCell>
                                        <TableCell className='border border-gray-300 p-2'>
                                            {transport.updateType === 'CREATE' ? (
                                                <div className='flex flex-col gap-1'>
                                                    {}
                                                </div>
                                            ) : (
                                                <div className='flex flex-col gap-1'>
                                                    <p>Cena: {transport.priceChange > 0 ? '+' : ''}{transport.priceChange}</p>
                                                    <p>Miejsca: {transport.capacityChange > 0 ? '+' : ''}{transport.capacityChange}</p>
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>

                <Paper elevation={2} style={{ height: 'fit-content' }}>
                    <div className='mt-4 mb-6 flex flex-row gap-2 items-center justify-center'>
                        <Hotel style={{ fontSize: 18 }} />
                        <h3 className='text-xl'>Aktualizacje hoteli</h3>
                    </div>

                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell className='border border-gray-300 p-2'>Data zmiany</TableCell>
                                    <TableCell className='border border-gray-300 p-2'>Hotel</TableCell>
                                    <TableCell className='border border-gray-300 p-2'>Pokój</TableCell>
                                    <TableCell className='border border-gray-300 p-2'>Typ zmiany</TableCell>
                                    <TableCell className='border border-gray-300 p-2'>Zmiany</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {hotelUpdates.map((hotel, index) => (
                                    <TableRow key={index}>
                                        <TableCell className='border border-gray-300 p-2'>{new Date(hotel.updateDateTime).toLocaleString()}</TableCell>
                                        <TableCell className='border border-gray-300 p-2'>{hotel.hotelName}</TableCell>
                                        <TableCell className='border border-gray-300 p-2'>{hotel.roomName}</TableCell>
                                        <TableCell className='border border-gray-300 p-2'>{hotel.updateType}</TableCell>
                                        <TableCell className='border border-gray-300 p-2'>
                                            {hotel.updateType === 'CREATE' ? (
                                                <div className='flex flex-col gap-1'>
                                                    {}
                                                </div>
                                            ) : (
                                                <div className='flex flex-col gap-1'>
                                                    <p>Cena: {hotel.priceChange > 0 ? '+' : ''}{hotel.priceChange}</p>
                                                    <p>Miejsca: {hotel.capacityChange > 0 ? '+' : ''}{hotel.capacityChange}</p>
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            </div>
        </div>
    );
}

export default TOUpdates;
