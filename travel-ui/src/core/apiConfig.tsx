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
        return await axiosInstance.get(`offers/?departureBus=${params.departureBus}&departurePlane=${params.departurePlane}&arrivals=${params.arrivals}&date_from=${params.dateFrom}&date_to=${params.dateTo}&adults=${params.adults}&teens=${params.teens}&kids=${params.kids}&infants=${params.infants}`);
    }

    static getOfferDetails = async (params: GetOfferDetailsParams) => {
        return await axiosInstance.get(`offers/${params.idHotel}?departure_buses=${params.departureBus}&departure_planes=${params.departurePlane}&date_from=${params.dateFrom}&date_to=${params.dateTo}&adults=${params.adults}&teens=${params.teens}&kids=${params.kids}&infants=${params.infants}`)
    }

    static reserveOffer = async (payload: ReservationRequestPayload) => {
        return await axiosInstance.post('reservations/reservation', payload);
    }

    static payForReservation = async (payload: PaymentPayload) => {
        return await axiosInstance.post('reservations/purchase', payload);
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
    dateFrom: string,
    dateTo: string,
    adults: number,
    teens: number,
    kids: number,
    infants: number,
}

export enum TransportType {
    Samolot = "Samolot",
    Bus = "Bus"
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
