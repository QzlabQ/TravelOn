import { v4 as uuidv4 } from 'uuid';

export type UserProfile = {
    id: string;
    email: string;
    name: string;
    surname: string;
    phone?: string | null;
    avatarUrl?: string | null;
    loyaltyTier?: string | null;
    role?: 'USER' | 'ADMIN' | string | null;
    createdAt?: string;
    updatedAt?: string;
    lastLoginAt?: string | null;
};
export type UserSession = {
    token: string;
    user: UserProfile;
};

export type BookingPreferences = {
    defaultDepartureCity: string;
    defaultArrivalCity: string;
    preferredHotelMinRating: number;
    preferredHotelMaxPrice: string;
    preferredTrainTypes: string[];
    onlyAvailableTickets: boolean;
};

export type AccountIdentity = {
    realName: string;
    documentType: string;
    documentNumber: string;
};

export type SavedBankCard = {
    id: string;
    cardNumber: string;
    label: string;
    createdAt: string;
};

type AppNotificationType = 'ORDER_CREATED' | 'PAYMENT_SUCCESS' | 'REFUND_COMPLETED';

type AppNotification = {
    id: string;
    type: AppNotificationType;
    title: string;
    message: string;
    reservationId?: string;
    createdAt: string;
    read: boolean;
};

const LOGGED_IN_USER_ID_KEY = 'userId';
const GUEST_USER_ID_KEY = 'guestUserId';
const AUTH_SESSION_KEY = 'authSession';
const BOOKING_PREFERENCES_KEY = 'bookingPreferences';
const ACCOUNT_IDENTITIES_KEY = 'accountIdentities';
const SAVED_BANK_CARDS_KEY = 'savedBankCards';
const NOTIFICATIONS_KEY = 'notifications';
export const AUTH_SESSION_EVENT = 'travel-ui-auth-session-changed';
export const BOOKING_PREFERENCES_EVENT = 'travel-ui-booking-preferences-changed';
export const ACCOUNT_IDENTITY_EVENT = 'travel-ui-account-identity-changed';
export const SAVED_BANK_CARDS_EVENT = 'travel-ui-saved-bank-cards-changed';
export const NOTIFICATIONS_EVENT = 'travel-ui-notifications-changed';

export const DEFAULT_BOOKING_PREFERENCES: BookingPreferences = {
    defaultDepartureCity: '北京',
    defaultArrivalCity: '上海',
    preferredHotelMinRating: 0,
    preferredHotelMaxPrice: '',
    preferredTrainTypes: ['GC', 'D', 'T', 'K', 'Z', 'OTHER'],
    onlyAvailableTickets: false,
};

const normalizeBookingPreferences = (value?: Partial<BookingPreferences> | null): BookingPreferences => {
    const preferredHotelMinRating = Number(value?.preferredHotelMinRating ?? DEFAULT_BOOKING_PREFERENCES.preferredHotelMinRating);
    const preferredTrainTypes = Array.isArray(value?.preferredTrainTypes) && value.preferredTrainTypes.length > 0
        ? value.preferredTrainTypes
        : DEFAULT_BOOKING_PREFERENCES.preferredTrainTypes;

    return {
        defaultDepartureCity: value?.defaultDepartureCity?.trim() || DEFAULT_BOOKING_PREFERENCES.defaultDepartureCity,
        defaultArrivalCity: value?.defaultArrivalCity?.trim() || DEFAULT_BOOKING_PREFERENCES.defaultArrivalCity,
        preferredHotelMinRating: Math.min(5, Math.max(0, Number.isNaN(preferredHotelMinRating) ? 0 : preferredHotelMinRating)),
        preferredHotelMaxPrice: value?.preferredHotelMaxPrice?.trim() || '',
        preferredTrainTypes,
        onlyAvailableTickets: Boolean(value?.onlyAvailableTickets),
    };
};

const readLocalRecord = <T>(key: string): Record<string, T> => {
    const rawValue = localStorage.getItem(key);
    if (!rawValue) return {};

    try {
        return JSON.parse(rawValue) as Record<string, T>;
    } catch {
        localStorage.removeItem(key);
        return {};
    }
};

const writeLocalRecord = <T>(key: string, value: Record<string, T>) => {
    localStorage.setItem(key, JSON.stringify(value));
};

export const getCurrentUserSession = (): UserSession | null => {
    const rawSession = localStorage.getItem(AUTH_SESSION_KEY);
    if (!rawSession) {
        return null;
    }

    try {
        return JSON.parse(rawSession) as UserSession;
    } catch (e) {
        localStorage.removeItem(AUTH_SESSION_KEY);
        localStorage.removeItem(LOGGED_IN_USER_ID_KEY);
        return null;
    }
};

export const setCurrentUserSession = (session: UserSession) => {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(LOGGED_IN_USER_ID_KEY, session.user.id);
    window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
};

export const updateCurrentUserProfile = (user: UserProfile) => {
    const session = getCurrentUserSession();
    if (!session) {
        return;
    }

    setCurrentUserSession({...session, user});
};

export const clearCurrentUserSession = () => {
    localStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(LOGGED_IN_USER_ID_KEY);
    window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
};

export const getCurrentUserId = () => {
    const session = getCurrentUserSession();
    if (session?.user.id) {
        return session.user.id;
    }

    let guestUserId = localStorage.getItem(GUEST_USER_ID_KEY);
    if (!guestUserId) {
        guestUserId = uuidv4();
        localStorage.setItem(GUEST_USER_ID_KEY, guestUserId);
    }

    return guestUserId;
};

export const getCurrentUserMode = () => {
    return getCurrentUserSession() ? 'ACCOUNT' : 'GUEST';
};

export const isCurrentUserAdmin = () => {
    return getCurrentUserSession()?.user.role === 'ADMIN';
};

export const getBookingPreferences = (): BookingPreferences => {
    const rawPreferences = localStorage.getItem(BOOKING_PREFERENCES_KEY);
    if (!rawPreferences) {
        return DEFAULT_BOOKING_PREFERENCES;
    }

    try {
        return normalizeBookingPreferences(JSON.parse(rawPreferences) as Partial<BookingPreferences>);
    } catch {
        localStorage.removeItem(BOOKING_PREFERENCES_KEY);
        return DEFAULT_BOOKING_PREFERENCES;
    }
};

export const setBookingPreferences = (preferences: BookingPreferences) => {
    const normalizedPreferences = normalizeBookingPreferences(preferences);
    localStorage.setItem(BOOKING_PREFERENCES_KEY, JSON.stringify(normalizedPreferences));
    window.dispatchEvent(new Event(BOOKING_PREFERENCES_EVENT));
    return normalizedPreferences;
};

export const getAccountIdentity = (userId = getCurrentUserId()): AccountIdentity => {
    const identities = readLocalRecord<AccountIdentity>(ACCOUNT_IDENTITIES_KEY);
    return identities[userId] ?? {
        realName: '',
        documentType: '身份证',
        documentNumber: '',
    };
};

export const getSavedBankCards = (userId = getCurrentUserId()): SavedBankCard[] => {
    const cards = readLocalRecord<SavedBankCard[]>(SAVED_BANK_CARDS_KEY);
    return Array.isArray(cards[userId]) ? cards[userId] : [];
};

export const saveBankCard = (cardNumber: string, label = '', userId = getCurrentUserId()) => {
    const cards = readLocalRecord<SavedBankCard[]>(SAVED_BANK_CARDS_KEY);
    const userCards = Array.isArray(cards[userId]) ? cards[userId] : [];
    const normalizedCardNumber = cardNumber.replace(/\D/g, '');
    const existingCard = userCards.find(card => card.cardNumber === normalizedCardNumber);
    if (existingCard) return existingCard;
    const savedCard: SavedBankCard = {
        id: uuidv4(),
        cardNumber: normalizedCardNumber,
        label: label.trim() || '\u6211\u7684\u94f6\u8054\u5361',
        createdAt: new Date().toISOString(),
    };
    cards[userId] = [...userCards, savedCard];
    writeLocalRecord(SAVED_BANK_CARDS_KEY, cards);
    window.dispatchEvent(new Event(SAVED_BANK_CARDS_EVENT));
    return savedCard;
};

export const removeSavedBankCard = (cardId: string, userId = getCurrentUserId()) => {
    const cards = readLocalRecord<SavedBankCard[]>(SAVED_BANK_CARDS_KEY);
    const userCards = Array.isArray(cards[userId]) ? cards[userId] : [];
    cards[userId] = userCards.filter(card => card.id !== cardId);
    writeLocalRecord(SAVED_BANK_CARDS_KEY, cards);
    window.dispatchEvent(new Event(SAVED_BANK_CARDS_EVENT));
};

export const setAccountIdentity = (identity: AccountIdentity, userId = getCurrentUserId()) => {
    const identities = readLocalRecord<AccountIdentity>(ACCOUNT_IDENTITIES_KEY);
    const normalizedIdentity: AccountIdentity = {
        realName: identity.realName.trim(),
        documentType: identity.documentType.trim() || '身份证',
        documentNumber: identity.documentNumber.trim(),
    };
    identities[userId] = normalizedIdentity;
    writeLocalRecord(ACCOUNT_IDENTITIES_KEY, identities);
    window.dispatchEvent(new Event(ACCOUNT_IDENTITY_EVENT));
    return normalizedIdentity;
};

export const getNotifications = (userId = getCurrentUserId()): AppNotification[] => {
    const notifications = readLocalRecord<AppNotification[]>(NOTIFICATIONS_KEY);
    return Array.isArray(notifications[userId]) ? notifications[userId] : [];
};

export const addNotification = (
    notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>,
    userId = getCurrentUserId()
) => {
    const notifications = readLocalRecord<AppNotification[]>(NOTIFICATIONS_KEY);
    const nextNotification: AppNotification = {
        ...notification,
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        read: false,
    };
    notifications[userId] = [nextNotification, ...getNotifications(userId)].slice(0, 30);
    writeLocalRecord(NOTIFICATIONS_KEY, notifications);
    window.dispatchEvent(new Event(NOTIFICATIONS_EVENT));
    return nextNotification;
};
