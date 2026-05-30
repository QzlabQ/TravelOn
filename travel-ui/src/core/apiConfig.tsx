import axios from "axios";

export const baseAPIURL = `http://${process.env.REACT_APP_API_HOSTNAME}:${process.env.REACT_APP_API_PORT}/`;
export const baseWSURL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${process.env.REACT_APP_API_HOSTNAME}:${process.env.REACT_APP_API_PORT}/`;

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

    static getOffersBySearchQuery = async (params: GetOffersBySearchQueryParams) => {
        return await axiosInstance.get(`offers/?departureBus=${params.departureBus}&departurePlane=${params.departurePlane}&departureTrain=${params.departureTrain}&arrivals=${params.arrivals}&date_from=${params.dateFrom}&date_to=${params.dateTo}&adults=${params.adults}&teens=${params.teens}&kids=${params.kids}&infants=${params.infants}`);
    }

    static getOfferDetails = async (params: GetOfferDetailsParams) => {
        return await axiosInstance.get(`offers/${params.idHotel}?departure_buses=${params.departureBus}&departure_planes=${params.departurePlane}&departure_trains=${params.departureTrain}&date_from=${params.dateFrom}&date_to=${params.dateTo}&adults=${params.adults}&teens=${params.teens}&kids=${params.kids}&infants=${params.infants}`)
    }

    static reserveOffer = async (payload: ReservationRequestPayload) => {
        return await axiosInstance.post('reservations/reservation', payload);
    }

    static payForReservation = async (payload: PaymentPayload) => {
        return await axiosInstance.post('reservations/purchase', payload);
    }

    static getReservationsForUser = async (userId: string) => {
        return await axiosInstance.get(`reservations/user/${userId}`);
    }

    static cancelReservation = async (reservationId: string) => {
        return await axiosInstance.post(`reservations/${reservationId}/cancel`);
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

    static createPlannerConversation = async (payload: CreatePlannerConversationPayload) => {
        return await axiosInstance.post<PlannerConversationResponse>('ai-arrange/api/conversations', payload);
    }

    static getPlannerConversation = async (conversationId: string, userId: string) => {
        return await axiosInstance.get<PlannerConversationResponse>(`ai-arrange/api/conversations/${conversationId}?userId=${userId}`);
    }

    static listPlannerSnapshots = async (conversationId: string, userId: string) => {
        return await axiosInstance.get<PlannerSnapshot[]>(`ai-arrange/api/conversations/${conversationId}/snapshots?userId=${userId}`);
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

export interface GetOffersBySearchQueryParams {
    departurePlane: string[],
    departureBus: string[],
    departureTrain: string[],
    arrivals: string[],
    dateFrom: string,
    dateTo: string,
    adults: number,
    teens: number,
    kids: number,
    infants: number,
}

export interface GetOfferDetailsParams {
    idHotel: string,
    departurePlane: string[],
    departureBus: string[],
    departureTrain: string[],
    dateFrom: string,
    dateTo: string,
    adults: number,
    teens: number,
    kids: number,
    infants: number,
}

export enum TransportType {
    Samolot = "Samolot",
    Bus = "Bus",
    Pociag = "Pociag"
}

export interface ReservationRequestPayload {
    id: string,
    hotelId: string,
    hotelTimeFrom: string,
    hotelTimeTo: string,

    adultsQuantity: number,
    childrenUnder18Quantity: number,
    childrenUnder10Quantity: number,
    childrenUnder3Quantity: number,
    price: number,

    roomReservationsIds: string[],
    transportReservationsIds: string[],
    userId: string,

    hotelName: string,
    roomReservationsNames: string[],
    locationFromNameRegionAndCountry: string,
    locationToNameRegionAndCountry: string,
    transportType: TransportType,
}

export interface PaymentPayload {
    reservationId: string,
    cardNumber: string,
}

export type ReservationStatus = 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED' | 'EXPIRED';

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
}

export interface LoginPayload {
    email: string,
    password: string,
}

export interface RegisterPayload {
    email: string,
    password: string,
    name: string,
    surname: string,
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

export interface PlannerCoreSlots {
    city: string,
    travelStartDate: string,
    travelEndDate?: string,
    peopleCount: number,
    budget?: string,
    travelStyle?: string,
    accommodationPreference?: string,
    transportPreference?: string,
    notes?: string,
    mustVisitKeywords?: string[],
    avoidKeywords?: string[],
}

export interface CreatePlannerConversationPayload {
    userId: string,
    coreSlots: PlannerCoreSlots,
}

export interface PlannerConversationResponse {
    id: string,
    userId: string,
    status: PlannerConversationStatus,
    coreSlots: PlannerCoreSlots,
    title: string,
    currentMarkdown: string,
    latestSnapshotVersion: number,
    selectedPlaceIds: string[],
    createdAt: string,
    updatedAt: string,
}

export type PlannerConversationStatus = 'COLLECTING_SLOTS' | 'ACTIVE_CHAT' | 'COMPLETED';

export interface PlannerSocketEnvelope<TPayload = unknown> {
    type: PlannerMessageType,
    conversationId: string,
    userId?: string,
    payload?: TPayload,
}

export type PlannerMessageType =
    'PLANNER_CHAT_SEND'
    | 'PLANNER_CHAT_STREAM'
    | 'PLANNER_DATA_REFRESH'
    | 'PLANNER_PLACE_SELECTION'
    | 'PLANNER_ERROR';

export interface PlannerChatSendPayload {
    message: string,
    selectedPlaceIds: string[],
}

export interface PlannerPlaceSelectionPayload {
    selectedPlaceIds: string[],
}

export interface PlannerChatStreamPayload {
    delta: string,
    done: boolean,
}

export interface PlannerDataRefreshPayload {
    status: PlannerConversationStatus,
    title: string,
    summary?: string,
    markdown: string,
    snapshotVersion: number,
    places: PlannerPlaceSuggestion[],
    routes: PlannerRouteSegment[],
    selectedPlaceIds: string[],
}

export interface PlannerPlaceSuggestion {
    placeId: string,
    name: string,
    type?: PlannerPlaceType,
    source?: PlannerPlaceSource,
    internalOfferId?: string,
    amapPoiId?: string,
    latitude?: number,
    longitude?: number,
    address?: string,
    imageUrl?: string,
    description?: string,
    selected?: boolean,
    tags?: string[],
}

export type PlannerPlaceType = 'SCENIC' | 'RESTAURANT' | 'HOTEL' | 'TRANSPORT' | 'SHOPPING' | 'OTHER';

export type PlannerPlaceSource = 'AI' | 'AMAP' | 'INTERNAL_OFFER';

export interface PlannerRouteSegment {
    fromPlaceId?: string,
    toPlaceId?: string,
    transportMode?: string,
    distanceKm?: number,
    estimatedMinutes?: number,
    polyline?: string,
    summary?: string,
}

export interface PlannerSnapshot {
    id: string,
    conversationId: string,
    userId: string,
    version: number,
    title: string,
    summary?: string,
    markdown: string,
    assistantText?: string,
    places: PlannerPlaceSuggestion[],
    routes: PlannerRouteSegment[],
    selectedPlaceIds: string[],
    createdAt: string,
}

export function buildPlannerWebSocketUrl(conversationId: string, userId: string) {
    const params = new URLSearchParams({conversationId, userId});
    return `${baseWSURL}ai-arrange/ws/planner?${params.toString()}`;
}
