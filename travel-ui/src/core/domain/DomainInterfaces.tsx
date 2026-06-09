
export interface Offer {
    idHotel: number,
    hotelName: string,
    description: string,
    price: number,
    destination: Location,
    imageUrls: string[],

    roomConfiguration: RoomConfiguration,
    possibleRoomConfigurations: RoomConfiguration[],

    departure: Transport[],
    possibleDepartures: Transport[][],
}

export interface Location {
    idLocation: string,
    region: string,
    country: string,
}

export interface Room {
    roomId: string,
    name: string,
    description: string,
    guestCapacity: number,
}

export interface RoomConfiguration {
    rooms: Room[],
    pricePerAdult: number,
}

export interface Transport {
    idTransport: string,
    departureDate: Date,
    capacity: number,
    pricePerAdult: number,

    transportCourse: TransportCourse
}

export interface TransportCourse {
    idTransportCourse: string,
    type: 'PLANE' | 'BUS' | 'TRAIN',
    departureFromLocation: Location,
    arrivalAtLocation: Location,
}
