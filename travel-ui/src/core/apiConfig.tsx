import axios from "axios";

export const baseAPIURL = `http://${process.env.REACT_APP_API_HOSTNAME}:${process.env.REACT_APP_API_PORT}/`;

export const axiosInstance = axios.create({
    baseURL: baseAPIURL,
    timeout: 100000,
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
    },
});

export class ApiRequests {
    static getAvailableDestinations = async () => {
        return await axiosInstance.get('transports/available');
    }

    static getTicketOptions = async (type: TicketType) => {
        return await axiosInstance.get<TicketOptions>('transports/tickets/options', {
            params: {type}
        });
    }

    static searchTickets = async (params: SearchTicketsParams) => {
        return await axiosInstance.get<TicketSearchOffer[]>('transports/tickets', {
            params
        });
    }

    static searchHotels = async (params: SearchHotelsParams) => {
        return await axiosInstance.get<HotelSearchOffer[]>('hotels/search', {
            params
        });
    }

    static getHotelDetails = async (hotelId: string, params: HotelDetailsParams) => {
        return await axiosInstance.get<HotelDetailsResponse>(`hotels/${hotelId}`, {
            params
        });
    }

    static getHotelDestinations = async () => {
        return await axiosInstance.get('hotels/destinations');
    }

    static payForReservation = async (payload: PaymentPayload) => {
        return await axiosInstance.post('reservations/purchase', payload);
    }

    static getReservationsForUser = async (userId: string) => {
        return await axiosInstance.get(`reservations/user/${userId}`);
    }

    static getReservation = async (reservationId: string) => {
        return await axiosInstance.get<ReservationResponse>(`reservations/${reservationId}`);
    }

    static cancelReservation = async (reservationId: string, reason?: string) => {
        return await axiosInstance.post<ReservationResponse>(`reservations/${reservationId}/cancel`, {reason});
    }

    static getReservationPayments = async (reservationId: string) => {
        return await axiosInstance.get<PaymentTransactionResponse[]>(`reservations/${reservationId}/payments`);
    }

    static getReservationRefunds = async (reservationId: string) => {
        return await axiosInstance.get<RefundRecordResponse[]>(`reservations/${reservationId}/refunds`);
    }

    static completeRefund = async (reservationId: string) => {
        return await axiosInstance.post<ReservationResponse>(`reservations/${reservationId}/refunds/complete`);
    }

    static createTicketReservation = async (payload: CreateTicketReservationPayload) => {
        return await axiosInstance.post<ReservationResponse>('reservations/tickets', payload);
    }

    static createHotelReservation = async (payload: CreateHotelReservationPayload) => {
        return await axiosInstance.post<ReservationResponse>('reservations/hotels', payload);
    }

    static login = async (payload: LoginPayload) => {
        return await axiosInstance.post<AuthResponse>('users/auth/login', payload);
    }

    static register = async (payload: RegisterPayload) => {
        return await axiosInstance.post<AuthResponse>('users/auth/register', payload);
    }

    static getCurrentUser = async (token: string) => {
        return await axiosInstance.get<UserProfileResponse>('users/me', {
            headers: {'X-User-Token': token}
        });
    }

    static updateCurrentUser = async (token: string, payload: UpdateProfilePayload) => {
        return await axiosInstance.put<UserProfileResponse>('users/me', payload, {
            headers: {'X-User-Token': token}
        });
    }

    static logout = async (token: string) => {
        return await axiosInstance.post('users/auth/logout', {}, {
            headers: {'X-User-Token': token}
        });
    }

    static listTravelers = async (token: string) => {
        return await axiosInstance.get<TravelerResponse[]>('users/me/travelers', {
            headers: {'X-User-Token': token}
        });
    }

    static createTraveler = async (token: string, payload: TravelerPayload) => {
        return await axiosInstance.post<TravelerResponse>('users/me/travelers', payload, {
            headers: {'X-User-Token': token}
        });
    }

    static updateTraveler = async (token: string, travelerId: string, payload: TravelerPayload) => {
        return await axiosInstance.put<TravelerResponse>(`users/me/travelers/${travelerId}`, payload, {
            headers: {'X-User-Token': token}
        });
    }

    static deleteTraveler = async (token: string, travelerId: string) => {
        return await axiosInstance.delete(`users/me/travelers/${travelerId}`, {
            headers: {'X-User-Token': token}
        });
    }
}

export interface GetOffersBySearchQueryOffer {
    idHotel: string,
    hotelName: string,
    description: string,
    price: number,
    destination: string,
    rating: number,
    imageUrl: string,
}

export interface PaymentPayload {
    reservationId: string,
    cardNumber: string,
}

export type ReservationStatus = 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED' | 'EXPIRED' | 'REFUND_PROCESSING' | 'REFUNDED';

export interface ReservationResponse {
    id: string,
    hotelTimeFrom: string,
    hotelTimeTo: string,
    adultsQuantity: number,
    childrenUnder3Quantity: number,
    childrenUnder10Quantity: number,
    childrenUnder18Quantity: number,
    price: number,
    paid: boolean,
    status: ReservationStatus,
    bookingType: 'PACKAGE' | 'FLIGHT' | 'TRAIN' | 'HOTEL' | string,
    hotelId?: string | null,
    roomReservationsIds: string[],
    transportReservationsIds: string[],
    userId: string,
    title?: string | null,
    routeFrom?: string | null,
    routeTo?: string | null,
    provider?: string | null,
    bookingCode?: string | null,
    travelers: BookingPersonResponse[],
    createdAt?: string | null,
    paymentDeadline?: string | null,
    paidAt?: string | null,
    cancelledAt?: string | null,
    refundRequestedAt?: string | null,
    refundedAt?: string | null,
    cancellationReason?: string | null,
}

export interface PaymentTransactionResponse {
    id: string,
    reservationId: string,
    amount: number,
    cardLast4?: string | null,
    approved: boolean,
    status: 'SUCCESS' | 'FAILED' | string,
    failureReason?: string | null,
    createdAt?: string | null,
}

export type RefundStatus = 'PROCESSING' | 'COMPLETED' | 'REJECTED';

export interface RefundRecordResponse {
    id: string,
    reservationId: string,
    amount: number,
    reason?: string | null,
    status: RefundStatus,
    requestedAt?: string | null,
    completedAt?: string | null,
}

export interface CreateTicketReservationPayload {
    userId: string,
    transportType: 'FLIGHT' | 'TRAIN',
    routeFrom: string,
    routeTo: string,
    departureDate: string,
    departureTime: string,
    arrivalTime: string,
    provider: string,
    bookingCode: string,
    passengerCount: number,
    price: number,
    travelers: BookingPersonPayload[],
}

export interface CreateHotelReservationPayload {
    userId: string,
    hotelId: string,
    hotelName: string,
    dateFrom: string,
    dateTo: string,
    adultsQuantity: number,
    childrenUnder3Quantity: number,
    childrenUnder10Quantity: number,
    childrenUnder18Quantity: number,
    price: number,
    roomName?: string,
    travelers: BookingPersonPayload[],
}

export type TravelerType = 'ADULT' | 'CHILD' | 'STUDENT';

export interface TravelerPayload {
    name: string,
    travelerType: TravelerType,
    documentType?: string,
    documentNumber?: string,
    phone?: string,
    student: boolean,
    defaultTraveler: boolean,
}

export interface TravelerResponse extends TravelerPayload {
    id: string,
    createdAt?: string,
    updatedAt?: string,
}

export interface BookingPersonPayload {
    travelerId?: string,
    name: string,
    travelerType: TravelerType,
    documentType?: string,
    documentNumber?: string,
    phone?: string,
}

export interface BookingPersonResponse {
    travelerId?: string | null,
    name: string,
    travelerType: TravelerType,
    documentType?: string | null,
    maskedDocumentNumber?: string | null,
    maskedPhone?: string | null,
}

export type TicketType = 'FLIGHT' | 'TRAIN';

export interface TicketOptions {
    departures: string[],
    arrivals: string[],
}

export interface SearchTicketsParams {
    type: TicketType,
    departureCity: string,
    arrivalCity: string,
    departureDate: string,
    minPrice?: number,
    maxPrice?: number,
    studentOnly?: boolean,
    onlyAvailable?: boolean,
    sortBy?: 'departure' | 'price' | 'seats' | string,
}

export interface TicketSearchOffer {
    id: string,
    type: TicketType,
    departureCity: string,
    arrivalCity: string,
    departureStation: string,
    arrivalStation: string,
    departureTime: string,
    arrivalTime: string,
    duration: string,
    carrier: string,
    code: string,
    seatClass: string,
    price: number,
    remainingSeats: number,
    studentEligible: boolean,
    successRate: string,
    notice: string,
    departureDate: string,
    referenceDate: string,
    sourceUrl: string,
    sourceNote: string,
}

export interface SearchHotelsParams {
    destinationId: string,
    dateFrom: string,
    dateTo: string,
    adults?: number,
    hotelName?: string,
    minPrice?: number,
    maxPrice?: number,
    minRating?: number,
    hotelType?: 'ALL' | 'HOTEL' | 'HOMESTAY' | string,
    roomType?: 'ALL' | 'DOUBLE' | 'FAMILY' | string,
    sortBy?: 'price' | 'price_desc' | 'rating' | string,
}

export interface HotelSearchOffer {
    hotelId: string,
    name: string,
    rating: number,
    description: string,
    location: {
        idLocation: string,
        region: string,
        country: string,
    },
    photos: string[],
    pricePerAdult: number,
}

export interface HotelDetailsParams {
    dateFrom: string,
    dateTo: string,
    adults?: number,
    childrenUnder3?: number,
    childrenUnder10?: number,
    childrenUnder18?: number,
}

export interface HotelRoomResponse {
    roomId: string,
    name: string,
    description: string,
    guestCapacity: number,
}

export interface HotelRoomConfiguration {
    rooms: HotelRoomResponse[],
    pricePerAdult: number,
}

export interface HotelCateringOption {
    cateringId: string,
    type: string,
    rating: number,
    price: number,
    hotelId: string,
}

export interface HotelDetailsResponse {
    hotelId: string,
    hotelName: string,
    rating: number,
    description: string,
    location: {
        idLocation: string,
        region: string,
        country: string,
    },
    cateringOptions: HotelCateringOption[],
    photos: string[],
    roomsConfigurations: HotelRoomConfiguration[],
}

export interface LoginPayload {
    email: string,
    password: string,
}

export interface RegisterPayload {
    email: string,
    password: string,
    name: string,
    surname?: string,
    phone?: string,
}

export interface UpdateProfilePayload {
    email?: string,
    name?: string,
    surname?: string,
    phone?: string,
    avatarUrl?: string,
}

export interface UserProfileResponse {
    id: string,
    email: string,
    name: string,
    surname: string,
    phone?: string | null,
    avatarUrl?: string | null,
    loyaltyTier?: string | null,
    createdAt?: string,
    updatedAt?: string,
    lastLoginAt?: string | null,
}

export interface AuthResponse {
    token: string,
    user: UserProfileResponse,
}
