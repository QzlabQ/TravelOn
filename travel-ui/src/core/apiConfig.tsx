import axios from "axios";

const apiHostname = process.env.REACT_APP_API_HOSTNAME || "localhost";
const apiPort = process.env.REACT_APP_API_PORT || "58082";

export const baseAPIURL = `http://${apiHostname}:${apiPort}/`;
export const baseWSURL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${apiHostname}:${apiPort}/`;

/**
 * Resolves an image reference for display. Absolute URLs (seed data) and data URLs
 * are returned untouched; relative paths from the local upload endpoint
 * (e.g. /community/uploads/xyz.jpg) are prefixed with the API base URL.
 */
export const resolveCommunityImageUrl = (url?: string | null): string => {
    if (!url) return "";
    if (/^(https?:)?\/\//.test(url) || url.startsWith("data:")) return url;
    return baseAPIURL.replace(/\/$/, "") + (url.startsWith("/") ? url : `/${url}`);
};

export const axiosInstance = axios.create({
    baseURL: baseAPIURL,
    timeout: 100000,
    headers: {
        'Accept': 'application/json',
    },
});

// Only set Content-Type for requests with a body (POST/PUT/PATCH).
// Putting Content-Type in common headers causes unnecessary CORS preflights on GET requests.
axiosInstance.defaults.headers.post['Content-Type'] = 'application/json; charset=utf-8';
axiosInstance.defaults.headers.put['Content-Type'] = 'application/json; charset=utf-8';
axiosInstance.defaults.headers.patch = {'Content-Type': 'application/json; charset=utf-8'};

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

    static getHotelDetails = async (hotelId: number, params: HotelDetailsParams) => {
        return await axiosInstance.get<HotelDetailsResponse>(`hotels/${hotelId}`, {
            params
        });
    }

    static getHotelDestinations = async () => {
        return await axiosInstance.get<HotelDestination[]>('hotels/destinations');
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

    static createPlannerConversation = async (payload: CreatePlannerConversationPayload) => {
        return await axiosInstance.post<PlannerConversationResponse>('ai-arrange/api/conversations', payload);
    }

    static getPlannerConversation = async (conversationId: string, userId: string) => {
        return await axiosInstance.get<PlannerConversationResponse>(`ai-arrange/api/conversations/${conversationId}?userId=${userId}`);
    }

    static listPlannerSnapshots = async (conversationId: string, userId: string) => {
        return await axiosInstance.get<PlannerSnapshot[]>(`ai-arrange/api/conversations/${conversationId}/snapshots?userId=${userId}`);
    }

    static getPlannerSnapshot = async (conversationId: string, userId: string, version: number) => {
        return await axiosInstance.get<PlannerSnapshot>(`ai-arrange/api/conversations/${conversationId}/snapshots/${version}`, {
            params: {userId}
        });
    }

    static rollbackPlannerSnapshot = async (conversationId: string, userId: string, version: number) => {
        return await axiosInstance.post<PlannerSnapshot>(`ai-arrange/api/conversations/${conversationId}/snapshots/${version}/rollback`, {}, {
            params: {userId}
        });
    }

    static restorePlannerDaySnapshot = async (conversationId: string, userId: string, dayIndex: number, version: number) => {
        return await axiosInstance.post<PlannerSnapshot>(`ai-arrange/api/conversations/${conversationId}/day-plans/${dayIndex}/snapshots/${version}/restore`, {}, {
            params: {userId}
        });
    }

    static listPlannerDayVersions = async (conversationId: string, userId: string, dayIndex: number) => {
        return await axiosInstance.get<PlannerDayVersion[]>(`ai-arrange/api/conversations/${conversationId}/day-plans/${dayIndex}/versions`, {
            params: {userId}
        });
    }

    static activatePlannerDayVersion = async (conversationId: string, userId: string, dayIndex: number, dayVersion: number) => {
        return await axiosInstance.post<PlannerSnapshot>(`ai-arrange/api/conversations/${conversationId}/day-plans/${dayIndex}/versions/${dayVersion}/activate`, {}, {
            params: {userId}
        });
    }

    static assemblePlannerTripSnapshot = async (conversationId: string, userId: string) => {
        return await axiosInstance.post<PlannerSnapshot>(`ai-arrange/api/conversations/${conversationId}/day-plans/assemble`, {}, {
            params: {userId}
        });
    }

    static diffPlannerSnapshots = async (conversationId: string, userId: string, fromVersion: number, toVersion: number) => {
        return await axiosInstance.get<PlannerSnapshotDiffResponse>(`ai-arrange/api/conversations/${conversationId}/snapshots/${fromVersion}/diff/${toVersion}`, {
            params: {userId}
        });
    }

    static runPlannerAgent = async (conversationId: string, payload: RunPlannerAgentPayload) => {
        return await axiosInstance.post<PlannerSnapshot>(`ai-arrange/api/conversations/${conversationId}/planner/run`, payload);
    }

    static listCommunityPosts = async (params: CommunityPostsQuery, token?: string) => {
        return await axiosInstance.get<PageResponse<CommunityPostResponse>>('community/posts', {
            params,
            headers: token ? {'X-User-Token': token} : undefined,
        });
    }

    static createCommunityPost = async (token: string, payload: CreateCommunityPostPayload) => {
        return await axiosInstance.post<CommunityPostResponse>('community/posts', payload, {
            headers: {'X-User-Token': token}
        });
    }

    static getCommunityPost = async (postId: string, token?: string) => {
        return await axiosInstance.get<CommunityPostResponse>(`community/posts/${postId}`, {
            headers: token ? {'X-User-Token': token} : undefined,
        });
    }

    static toggleCommunityPostLike = async (token: string, postId: string) => {
        return await axiosInstance.post<CommunityLikeResponse>(`community/posts/${postId}/likes`, {}, {
            headers: {'X-User-Token': token}
        });
    }

    static listCommunityReviews = async (params: CommunityReviewsQuery, token?: string) => {
        return await axiosInstance.get<PageResponse<CommunityReviewResponse>>('community/reviews', {
            params,
            headers: token ? {'X-User-Token': token} : undefined,
        });
    }

    static createCommunityReview = async (token: string, payload: CreateCommunityReviewPayload) => {
        return await axiosInstance.post<CommunityReviewResponse>('community/reviews', payload, {
            headers: {'X-User-Token': token}
        });
    }

    static uploadCommunityImage = async (token: string, file: File) => {
        const form = new FormData();
        form.append('file', file);
        // Override the global JSON default so axios treats the body as multipart.
        // (With Content-Type: application/json, axios v1 serializes FormData to JSON.)
        // The browser then replaces this with the real boundary when sending.
        return await axiosInstance.post<UploadResponse>('community/uploads', form, {
            headers: {'X-User-Token': token, 'Content-Type': 'multipart/form-data'}
        });
    }

    static getCommunitySummary = async (params: CommunitySummaryQuery) => {
        return await axiosInstance.get<CommunitySummaryResponse>('community/summary', {params});
    }

    static listAttractions = async (params: AttractionsQuery) => {
        return await axiosInstance.get<PageResponse<AttractionResponse>>('community/attractions', {params});
    }

    static createAttraction = async (token: string, payload: CreateAttractionPayload) => {
        return await axiosInstance.post<AttractionResponse>('community/attractions', payload, {
            headers: {'X-User-Token': token},
        });
    }

    static getAttraction = async (attractionId: string, token?: string) => {
        return await axiosInstance.get<AttractionDetailResponse>(`community/attractions/${attractionId}`, {
            headers: token ? {'X-User-Token': token} : undefined,
        });
    }

    static createAttractionReview = async (token: string, attractionId: string, payload: CreateAttractionReviewPayload) => {
        return await axiosInstance.post<CommunityReviewResponse>(`community/attractions/${attractionId}/reviews`, payload, {
            headers: {'X-User-Token': token},
        });
    }

    static listTravelRoutes = async (params: TravelRoutesQuery) => {
        return await axiosInstance.get<PageResponse<TravelRouteResponse>>('community/routes', {params});
    }

    static createTravelRoute = async (token: string, payload: CreateTravelRoutePayload) => {
        return await axiosInstance.post<TravelRouteResponse>('community/routes', payload, {
            headers: {'X-User-Token': token},
        });
    }

    static getTravelRoute = async (routeId: string, token?: string) => {
        return await axiosInstance.get<TravelRouteDetailResponse>(`community/routes/${routeId}`, {
            headers: token ? {'X-User-Token': token} : undefined,
        });
    }

    static createTravelRouteReview = async (token: string, routeId: string, payload: CreateAttractionReviewPayload) => {
        return await axiosInstance.post<CommunityReviewResponse>(`community/routes/${routeId}/reviews`, payload, {
            headers: {'X-User-Token': token},
        });
    }

    static toggleFavorite = async (token: string, payload: ToggleFavoritePayload) => {
        return await axiosInstance.post<FavoriteResponse>('community/favorites/toggle', payload, {
            headers: {'X-User-Token': token},
        });
    }

    static getFavoriteStatus = async (token: string | undefined, type: FavoriteTargetType, targetId: string) => {
        return await axiosInstance.get<FavoriteResponse>('community/favorites/status', {
            params: {type, targetId},
            headers: token ? {'X-User-Token': token} : undefined,
        });
    }

    static listPostComments = async (postId: string) => {
        return await axiosInstance.get<CommentResponse[]>(`community/posts/${postId}/comments`);
    }

    static createPostComment = async (token: string, postId: string, payload: CreateCommentPayload) => {
        return await axiosInstance.post<CommentResponse>(`community/posts/${postId}/comments`, payload, {
            headers: {'X-User-Token': token},
        });
    }

    static toggleReviewLike = async (token: string, reviewId: string | number) => {
        return await axiosInstance.post<ReviewLikeResponse>(`community/reviews/${reviewId}/likes`, {}, {
            headers: {'X-User-Token': token},
        });
    }

    static listMyPosts = async (token: string) => {
        return await axiosInstance.get<CommunityPostResponse[]>('community/me/posts', {
            headers: {'X-User-Token': token},
        });
    }

    static listMyRoutes = async (token: string) => {
        return await axiosInstance.get<TravelRouteResponse[]>('community/me/routes', {
            headers: {'X-User-Token': token},
        });
    }

    static listMyReviews = async (token: string) => {
        return await axiosInstance.get<CommunityReviewResponse[]>('community/me/reviews', {
            headers: {'X-User-Token': token},
        });
    }

    static listMyFavoritePosts = async (token: string) => {
        return await axiosInstance.get<CommunityPostResponse[]>('community/me/favorites/posts', {
            headers: {'X-User-Token': token},
        });
    }

    static listMyFavoriteRoutes = async (token: string) => {
        return await axiosInstance.get<TravelRouteResponse[]>('community/me/favorites/routes', {
            headers: {'X-User-Token': token},
        });
    }

    static listMyFavoriteAttractions = async (token: string) => {
        return await axiosInstance.get<AttractionResponse[]>('community/me/favorites/attractions', {
            headers: {'X-User-Token': token},
        });
    }
}

export interface PageResponse<T> {
    content: T[],
    totalElements: number,
    totalPages: number,
    number: number,
    size: number,
}

export interface GetOffersBySearchQueryOffer {
    idHotel: number,
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
    idHotel: number,
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
    hotelId: number,
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
    hotelId?: number | null,
    roomReservationsIds: string[],
    transportReservationsIds: string[],
    userId: string,
    title?: string | null,
    provider?: string | null,
    routeFrom?: string | null,
    routeTo?: string | null,
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
    departureDate: string,
    departureTime: string,
    arrivalTime: string,
    provider: string,
    bookingCode: string,
    passengerCount: number,
    price: number,
    travelers: BookingPersonPayload[],
    ticketOfferId?: string,
}

export interface CreateHotelReservationPayload {
    userId: string,
    hotelId: number,
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
    ticketOfferId?: string,
    type: TicketType,
    departureCity: string,
    arrivalCity: string,
    departureCityId: string,
    arrivalCityId: string,
    departureStationCode: string,
    departureTerminalName: string,
    arrivalStationCode: string,
    arrivalTerminalName: string,
    departureTime: string,
    arrivalTime: string,
    duration: string,
    carrier: string,
    code: string,
    seatClass: string,
    price: number,
    remainingSeats: number,
    totalSeats: number,
    successRate: string,
    notice: string,
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
    hotelId: number,
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

export interface HotelDetailsResponse {
    hotelId: number,
    hotelName: string,
    rating: number,
    description: string,
    location: {
        idLocation: string,
        region: string,
        country: string,
    },
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

export interface PlannerCoreSlots {
    departureCity?: string,
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
    | 'PLANNER_TRACE_EVENT'
    | 'PLANNER_OPTIONS_REFRESH'
    | 'PLANNER_SNAPSHOT_SAVED'
    | 'PLANNER_PLACE_SELECTION'
    | 'PLANNER_ERROR';

export interface PlannerChatSendPayload {
    message: string,
    selectedPlaceIds: string[],
    modelVariant?: PlannerModelVariant,
    planningMode?: string,
    planningScope?: PlannerPlanningScope,
    targetDayIndex?: number,
    targetDate?: string,
    interaction?: PlannerInteractionInput,
}

export interface RunPlannerAgentPayload extends PlannerChatSendPayload {
    userId: string,
}

export type PlannerModelVariant = 'FLASH' | 'PRO';

export type PlannerPlanningScope = 'DAY_PLAN' | 'DAY_REFINE' | 'TRIP_ASSEMBLE' | string;

export interface PlannerInteractionInput {
    selectedOptionIds?: string[],
    rejectedOptionIds?: string[],
    selectedPlaceIds?: string[],
    rejectedPlaceIds?: string[],
    freeText?: string,
    confirmCurrentPlan?: boolean,
}

export interface PlannerPlaceSelectionPayload {
    selectedPlaceIds: string[],
}

export interface PlannerChatStreamPayload {
    delta: string,
    done: boolean,
}

export type PlannerTraceEventType =
    'RUN_STARTED'
    | 'TOOL_STARTED'
    | 'TOOL_FINISHED'
    | 'MODEL_STARTED'
    | 'MODEL_FINISHED'
    | 'FALLBACK_USED'
    | 'OPTIONS_READY'
    | 'SNAPSHOT_DRAFT_READY'
    | 'RUN_FINISHED'
    | 'RUN_FAILED';

export interface PlannerTraceEvent {
    eventId?: string,
    traceId?: string,
    conversationId?: string,
    userId?: string,
    type: PlannerTraceEventType | string,
    status: string,
    message?: string,
    phase?: string,
    tool?: string,
    snapshotVersion?: number,
    targetDayIndex?: number,
    data?: Record<string, unknown>,
    createdAt?: string,
}

export interface PlannerErrorPayload {
    code?: string,
    message?: string,
    detail?: string,
}

export interface PlannerDataRefreshPayload {
    status: PlannerConversationStatus,
    title: string,
    summary?: string,
    markdown: string,
    snapshotVersion: number,
    scope?: PlannerPlanningScope,
    currentDayIndex?: number,
    completedDayIndexes?: number[],
    dayPlans?: PlannerDayPlanRef[],
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
    imageUrls?: string[],
    description?: string,
    selected?: boolean,
    tags?: string[],
    bookingLinks?: PlannerBookingLink[],
}

export interface PlannerBookingLink {
    type: 'HOTEL' | 'TRAIN' | 'FLIGHT' | string,
    label: string,
    url: string,
    hotelId?: number,
    ticketOfferId?: string,
    routeFrom?: string,
    routeTo?: string,
    departureDate?: string,
    bookingCode?: string,
    provider?: string,
    price?: number,
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

export interface PlannerDayPlanRef {
    dayIndex?: number,
    date?: string,
    status?: 'DRAFT' | 'CONFIRMED' | string,
    title?: string,
    markdown?: string,
    places?: PlannerPlaceSuggestion[],
    routes?: PlannerRouteSegment[],
    selectedPlaceIds?: string[],
    rejectedPlaceIds?: string[],
    changeSummary?: string,
    checksum?: string,
}

export interface PlannerDayVersion extends PlannerDayPlanRef {
    id: string,
    dayVersion: number,
    current: boolean,
    sourceSnapshotVersion?: number,
    createdAt: string,
}

export interface PlannerSnapshot {
    id: string,
    conversationId: string,
    userId: string,
    version: number,
    baseVersion?: number,
    scope?: PlannerPlanningScope,
    targetDayIndex?: number,
    currentDayIndex?: number,
    completedDayIndexes?: number[],
    title: string,
    summary?: string,
    markdown: string,
    nextQuestion?: string,
    assistantText?: string,
    places: PlannerPlaceSuggestion[],
    routes: PlannerRouteSegment[],
    currentDayPlan?: PlannerDayPlanRef,
    dayPlans?: PlannerDayPlanRef[],
    selectedPlaceIds: string[],
    rejectedPlaceIds?: string[],
    changeSummary?: string,
    patchOps?: Record<string, unknown>[],
    checksum?: string,
    traceId?: string,
    createdAt: string,
}

export interface PlannerSnapshotDiffItem {
    field: string,
    label: string,
    type: 'ADDED' | 'REMOVED' | 'CHANGED' | string,
    beforeValue?: unknown,
    afterValue?: unknown,
    summary?: string,
}

export interface PlannerSnapshotDiffResponse {
    conversationId: string,
    fromVersion: number,
    toVersion: number,
    fromTitle?: string,
    toTitle?: string,
    changes: PlannerSnapshotDiffItem[],
}

export function buildPlannerWebSocketUrl(conversationId: string, userId: string) {
    const params = new URLSearchParams({conversationId, userId});
    return `${baseWSURL}ai-arrange/ws/planner?${params.toString()}`;
}

export type CommunityCategory = 'TRAVEL_NOTE' | 'SCENIC_SPOT' | 'ROUTE' | 'MERCHANT' | 'HOTEL' | 'FOOD' | 'TRANSPORT' | 'OTHER';

export type ReviewTargetType = 'SCENIC_SPOT' | 'ROUTE' | 'MERCHANT' | 'HOTEL';

export type FavoriteTargetType = 'POST' | 'ROUTE' | 'ATTRACTION';

export interface CommunityPostsQuery {
    category?: CommunityCategory,
    keyword?: string,
    page?: number,
    size?: number,
    sort?: 'latest' | 'popular',
}

export interface CreateCommunityPostPayload {
    title: string,
    content: string,
    category: CommunityCategory,
    destinationCityId?: string,
    imageUrls?: string[],
}

export interface CommunityPostResponse {
    id: string,
    title: string,
    content: string,
    category: CommunityCategory,
    destination?: string | null,
    destinationCityId?: string | null,
    imageUrls: string[],
    authorUserId: string,
    authorName: string,
    likeCount: number,
    likedByCurrentUser: boolean,
    favoritedByCurrentUser: boolean,
    commentCount: number,
    createdAt: string,
    updatedAt: string,
}

export interface CommunityLikeResponse {
    postId: string,
    liked: boolean,
    likeCount: number,
}

export interface CommunityReviewsQuery {
    targetType?: ReviewTargetType,
    targetId?: string,
    category?: CommunityCategory,
    page?: number,
    size?: number,
}

export interface CreateCommunityReviewPayload {
    targetType: ReviewTargetType,
    targetId?: string,
    targetName: string,
    rating: number,
    content: string,
    category: CommunityCategory,
    imageUrls?: string[],
}

export interface CommunityReviewResponse {
    id: string,
    targetType: ReviewTargetType,
    targetId?: string | null,
    targetName: string,
    rating: number,
    content: string,
    category: CommunityCategory,
    imageUrls: string[],
    authorUserId: string,
    authorName: string,
    likeCount: number,
    likedByCurrentUser: boolean,
    createdAt: string,
    updatedAt: string,
}

export interface ToggleFavoritePayload {
    type: FavoriteTargetType,
    targetId: string,
}

export interface FavoriteResponse {
    type: FavoriteTargetType,
    targetId: string,
    favorited: boolean,
}

export interface CreateCommentPayload {
    content: string,
}

export interface CommentResponse {
    id: string,
    authorUserId: string,
    authorName: string,
    content: string,
    createdAt: string,
}

export interface ReviewLikeResponse {
    reviewId: number,
    liked: boolean,
    likeCount: number,
}

export interface CommunitySummaryQuery {
    targetType?: ReviewTargetType,
    targetId?: string,
}

export interface CommunitySummaryResponse {
    targetType?: ReviewTargetType,
    targetId?: string,
    averageRating: number,
    reviewCount: number,
    latestReviews: CommunityReviewResponse[],
}

export interface AttractionsQuery {
    cityId?: string,
    keyword?: string,
    sort?: "popular" | "latest",
    page?: number,
    size?: number,
}

export interface CreateAttractionPayload {
    name: string,
    cityId?: string,
    description?: string,
    imageUrls?: string[],
}

export interface AttractionResponse {
    id: string,
    name: string,
    city?: string | null,
    cityId?: string | null,
    description?: string | null,
    coverImageUrl?: string | null,
    imageUrls: string[],
    averageRating: number,
    reviewCount: number,
    createdByName: string,
    createdAt: string,
}

export interface AttractionDetailResponse extends AttractionResponse {
    favoritedByCurrentUser: boolean,
    latestReviews: CommunityReviewResponse[],
}

export interface CreateAttractionReviewPayload {
    rating: number,
    content: string,
    imageUrls?: string[],
}

export type TravelStyle = 'LEISURE' | 'CULTURE' | 'NATURE' | 'FOOD' | 'FAMILY' | 'ADVENTURE' | 'ROMANTIC' | 'OTHER';

export interface TravelRoutesQuery {
    style?: TravelStyle,
    cityId?: string,
    keyword?: string,
    sort?: 'latest' | 'popular',
    page?: number,
    size?: number,
}

export interface RouteStopInput {
    attractionId: string,
    dayNumber: number,
    sortOrder: number,
    note?: string,
}

export interface CreateTravelRoutePayload {
    title: string,
    summary?: string,
    days: number,
    peopleCount: number,
    budget: number,
    style: TravelStyle,
    cityId?: string,
    imageUrls?: string[],
    stops: RouteStopInput[],
}

export interface RouteStopResponse {
    attractionId: string,
    attractionName: string,
    attractionCity?: string | null,
    coverImageUrl?: string | null,
    dayNumber: number,
    sortOrder: number,
    note?: string | null,
}

export interface TravelRouteResponse {
    id: string,
    title: string,
    summary?: string | null,
    days: number,
    peopleCount: number,
    budget: number,
    style: TravelStyle,
    city?: string | null,
    cityId?: string | null,
    coverImageUrl?: string | null,
    stopCount: number,
    averageRating: number,
    reviewCount: number,
    createdByName: string,
    createdAt: string,
}

export interface TravelRouteDetailResponse {
    id: string,
    title: string,
    summary?: string | null,
    days: number,
    peopleCount: number,
    budget: number,
    style: TravelStyle,
    city?: string | null,
    cityId?: string | null,
    coverImageUrl?: string | null,
    imageUrls: string[],
    stops: RouteStopResponse[],
    averageRating: number,
    reviewCount: number,
    favoritedByCurrentUser: boolean,
    createdByName: string,
    createdAt: string,
    latestReviews: CommunityReviewResponse[],
}

export interface UploadResponse {
    url: string,
}

export interface HotelDestination {
    idLocation: string,
    cityId: string,
    country: string,
    province: string,
    region: string,
    normalizedName: string,
}
