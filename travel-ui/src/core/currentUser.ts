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

export type WalletTransactionType = 'TOP_UP' | 'PAYMENT' | 'REFUND';
export type WalletTopUpChannel = 'BANK_CARD';

export type SavedBankCard = {
    id: string;
    bankName: string;
    cardBrand: string;
    cardType: string;
    cardNumber: string;
    holderName: string;
    reservedPhone: string;
    defaultCard: boolean;
    createdAt: string;
    updatedAt: string;
};

export type SavedBankCardPayload = {
    bankName: string;
    cardBrand: string;
    cardType: string;
    cardNumber: string;
    holderName: string;
    reservedPhone: string;
    defaultCard?: boolean;
};

export type WalletTransaction = {
    id: string;
    type: WalletTransactionType;
    amount: number;
    balanceAfter: number;
    title: string;
    reservationId?: string;
    createdAt: string;
    channel?: WalletTopUpChannel;
    accountLabel?: string;
    referenceNo?: string;
};

export type WalletState = {
    balance: number;
    transactions: WalletTransaction[];
};

export type RechargeWalletOptions = {
    title?: string;
    channel?: WalletTopUpChannel;
    accountLabel?: string;
    referenceNo?: string;
};

export type PaymentMethodPreference = 'WALLET' | 'CARD';

export type UserPaymentPreferences = {
    defaultPaymentMethod: PaymentMethodPreference;
};

export type AppNotificationType = 'ORDER_CREATED' | 'PAYMENT_SUCCESS' | 'REFUND_COMPLETED';

export type AppNotification = {
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
const WALLETS_KEY = 'wallets';
const BANK_CARDS_KEY = 'savedBankCards';
const PAYMENT_PREFERENCES_KEY = 'paymentPreferences';
const NOTIFICATIONS_KEY = 'notifications';
export const AUTH_SESSION_EVENT = 'travel-ui-auth-session-changed';
export const BOOKING_PREFERENCES_EVENT = 'travel-ui-booking-preferences-changed';
export const ACCOUNT_IDENTITY_EVENT = 'travel-ui-account-identity-changed';
export const WALLET_EVENT = 'travel-ui-wallet-changed';
export const BANK_CARDS_EVENT = 'travel-ui-bank-cards-changed';
export const PAYMENT_PREFERENCES_EVENT = 'travel-ui-payment-preferences-changed';
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

const normalizeMoney = (value: number) => Math.round(Math.max(0, value) * 100) / 100;

const sortSavedBankCards = (cards: SavedBankCard[]) => cards.slice().sort((left, right) => {
    if (left.defaultCard !== right.defaultCard) {
        return left.defaultCard ? -1 : 1;
    }
    return (right.updatedAt || "").localeCompare(left.updatedAt || "");
});

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

export const getSavedBankCards = (userId = getCurrentUserId()): SavedBankCard[] => {
    const bankCards = readLocalRecord<SavedBankCard[]>(BANK_CARDS_KEY);
    const cards = bankCards[userId];
    if (!Array.isArray(cards)) {
        return [];
    }

    return sortSavedBankCards(cards.map(card => ({
        ...card,
        bankName: card.bankName || '银联卡',
        cardBrand: card.cardBrand || '银联',
        cardType: card.cardType || '借记卡',
        cardNumber: card.cardNumber || '',
        holderName: card.holderName || '',
        reservedPhone: card.reservedPhone || '',
        defaultCard: Boolean(card.defaultCard),
        createdAt: card.createdAt || new Date().toISOString(),
        updatedAt: card.updatedAt || card.createdAt || new Date().toISOString(),
    })));
};

const setSavedBankCards = (cards: SavedBankCard[], userId = getCurrentUserId()) => {
    const bankCards = readLocalRecord<SavedBankCard[]>(BANK_CARDS_KEY);
    const normalizedCards = sortSavedBankCards(cards).slice(0, 10);
    bankCards[userId] = normalizedCards;
    writeLocalRecord(BANK_CARDS_KEY, bankCards);
    window.dispatchEvent(new Event(BANK_CARDS_EVENT));
    return normalizedCards;
};

export const addSavedBankCard = (payload: SavedBankCardPayload, userId = getCurrentUserId()) => {
    const cards = getSavedBankCards(userId);
    if (cards.some(card => card.cardNumber === payload.cardNumber)) {
        throw new Error('这张银联卡已添加，请直接选择使用。');
    }

    const now = new Date().toISOString();
    const nextCard: SavedBankCard = {
        id: uuidv4(),
        bankName: payload.bankName.trim() || '银联卡',
        cardBrand: payload.cardBrand.trim() || '银联',
        cardType: payload.cardType.trim() || '借记卡',
        cardNumber: payload.cardNumber.trim(),
        holderName: payload.holderName.trim(),
        reservedPhone: payload.reservedPhone.trim(),
        defaultCard: cards.length === 0 || Boolean(payload.defaultCard),
        createdAt: now,
        updatedAt: now,
    };

    const nextCards = nextCard.defaultCard
        ? cards.map(card => ({...card, defaultCard: false}))
        : cards;
    return setSavedBankCards([...nextCards, nextCard], userId);
};

export const deleteSavedBankCard = (cardId: string, userId = getCurrentUserId()) => {
    const cards = getSavedBankCards(userId);
    const nextCards = cards.filter(card => card.id !== cardId);
    if (nextCards.length > 0 && !nextCards.some(card => card.defaultCard)) {
        nextCards[0] = {...nextCards[0], defaultCard: true, updatedAt: new Date().toISOString()};
    }
    return setSavedBankCards(nextCards, userId);
};

export const setDefaultSavedBankCard = (cardId: string, userId = getCurrentUserId()) => {
    const nextCards = getSavedBankCards(userId).map(card => ({
        ...card,
        defaultCard: card.id === cardId,
        updatedAt: card.id === cardId ? new Date().toISOString() : card.updatedAt,
    }));
    return setSavedBankCards(nextCards, userId);
};

export const getDefaultSavedBankCard = (userId = getCurrentUserId()) => {
    const cards = getSavedBankCards(userId);
    return cards.find(card => card.defaultCard) ?? cards[0] ?? null;
};

export const getWalletState = (userId = getCurrentUserId()): WalletState => {
    const wallets = readLocalRecord<WalletState>(WALLETS_KEY);
    const wallet = wallets[userId];
    if (!wallet) {
        return {balance: 0, transactions: []};
    }

    return {
        balance: normalizeMoney(Number(wallet.balance) || 0),
        transactions: Array.isArray(wallet.transactions) ? wallet.transactions : [],
    };
};

const setWalletState = (wallet: WalletState, userId = getCurrentUserId()) => {
    const wallets = readLocalRecord<WalletState>(WALLETS_KEY);
    const normalizedWallet: WalletState = {
        balance: normalizeMoney(wallet.balance),
        transactions: wallet.transactions.slice(0, 30),
    };
    wallets[userId] = normalizedWallet;
    writeLocalRecord(WALLETS_KEY, wallets);
    window.dispatchEvent(new Event(WALLET_EVENT));
    return normalizedWallet;
};

export const rechargeWallet = (
    amount: number,
    titleOrOptions: string | RechargeWalletOptions = '账户充值',
    userId = getCurrentUserId()
) => {
    const rechargeAmount = normalizeMoney(amount);
    if (rechargeAmount <= 0) {
        throw new Error('充值金额必须大于 0');
    }

    const options = typeof titleOrOptions === 'string'
        ? {title: titleOrOptions}
        : (titleOrOptions || {});
    const wallet = getWalletState(userId);
    const nextBalance = normalizeMoney(wallet.balance + rechargeAmount);
    return setWalletState({
        balance: nextBalance,
        transactions: [{
            id: uuidv4(),
            type: 'TOP_UP',
            amount: rechargeAmount,
            balanceAfter: nextBalance,
            title: options.title || '账户充值',
            createdAt: new Date().toISOString(),
            channel: options.channel,
            accountLabel: options.accountLabel,
            referenceNo: options.referenceNo,
        }, ...wallet.transactions],
    }, userId);
};

export const spendWallet = (amount: number, title: string, reservationId?: string, userId = getCurrentUserId()) => {
    const paymentAmount = normalizeMoney(amount);
    const wallet = getWalletState(userId);
    if (paymentAmount <= 0) {
        throw new Error('支付金额必须大于 0');
    }
    if (wallet.balance < paymentAmount) {
        throw new Error('余额不足，请先充值');
    }

    const nextBalance = normalizeMoney(wallet.balance - paymentAmount);
    return setWalletState({
        balance: nextBalance,
        transactions: [{
            id: uuidv4(),
            type: 'PAYMENT',
            amount: paymentAmount,
            balanceAfter: nextBalance,
            title,
            reservationId,
            createdAt: new Date().toISOString(),
        }, ...wallet.transactions],
    }, userId);
};

export const refundWallet = (amount: number, title: string, reservationId?: string, userId = getCurrentUserId()) => {
    const refundAmount = normalizeMoney(amount);
    if (refundAmount <= 0) {
        throw new Error('退款金额必须大于 0');
    }

    const wallet = getWalletState(userId);
    const nextBalance = normalizeMoney(wallet.balance + refundAmount);
    return setWalletState({
        balance: nextBalance,
        transactions: [{
            id: uuidv4(),
            type: 'REFUND',
            amount: refundAmount,
            balanceAfter: nextBalance,
            title,
            reservationId,
            createdAt: new Date().toISOString(),
        }, ...wallet.transactions],
    }, userId);
};

export const getPaymentPreferences = (userId = getCurrentUserId()): UserPaymentPreferences => {
    const preferences = readLocalRecord<UserPaymentPreferences>(PAYMENT_PREFERENCES_KEY);
    const preference = preferences[userId];
    return {
        defaultPaymentMethod: preference?.defaultPaymentMethod === 'CARD' ? 'CARD' : 'WALLET',
    };
};

export const setPaymentPreferences = (preference: UserPaymentPreferences, userId = getCurrentUserId()) => {
    const preferences = readLocalRecord<UserPaymentPreferences>(PAYMENT_PREFERENCES_KEY);
    const normalizedPreference: UserPaymentPreferences = {
        defaultPaymentMethod: preference.defaultPaymentMethod === 'CARD' ? 'CARD' : 'WALLET',
    };
    preferences[userId] = normalizedPreference;
    writeLocalRecord(PAYMENT_PREFERENCES_KEY, preferences);
    window.dispatchEvent(new Event(PAYMENT_PREFERENCES_EVENT));
    return normalizedPreference;
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

export const markNotificationRead = (notificationId: string, userId = getCurrentUserId()) => {
    const notifications = readLocalRecord<AppNotification[]>(NOTIFICATIONS_KEY);
    notifications[userId] = getNotifications(userId).map(notification =>
        notification.id === notificationId ? {...notification, read: true} : notification
    );
    writeLocalRecord(NOTIFICATIONS_KEY, notifications);
    window.dispatchEvent(new Event(NOTIFICATIONS_EVENT));
    return notifications[userId];
};

export const markAllNotificationsRead = (userId = getCurrentUserId()) => {
    const notifications = readLocalRecord<AppNotification[]>(NOTIFICATIONS_KEY);
    notifications[userId] = getNotifications(userId).map(notification => ({...notification, read: true}));
    writeLocalRecord(NOTIFICATIONS_KEY, notifications);
    window.dispatchEvent(new Event(NOTIFICATIONS_EVENT));
    return notifications[userId];
};
