
export interface Offer {
    idHotel: string,
    hotelName: string,
    description: string,
    price: number,
    destination: Location,
    imageUrls: string[],

    roomConfiguration: RoomConfiguration,
    possibleRoomConfigurations: RoomConfiguration[],

    cateringOptions: CateringOption[],

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

export interface CateringOption {
    idCateringOption: string,
    type: 'ALL_INCLUSIVE' | 'THREE_COURSES' | 'TWO_COURSES' | 'BREAKFAST' | 'NO_CATERING' | 'ACCORDING_TO_PROGRAMME',
    rating: number,
    price: number,
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
    type: 'PLANE' | 'BUS',
    departureFromLocation: Location,
    arrivalAtLocation: Location,
}
