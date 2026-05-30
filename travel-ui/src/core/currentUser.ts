import { v4 as uuidv4 } from 'uuid';

export type UserProfile = {
    id: string;
    email: string;
    name: string;
    surname: string;
    phone?: string | null;
    avatarUrl?: string | null;
    loyaltyTier?: string | null;
    createdAt?: string;
    updatedAt?: string;
    lastLoginAt?: string | null;
};

export type UserSession = {
    token: string;
    user: UserProfile;
};

const LOGGED_IN_USER_ID_KEY = 'userId';
const GUEST_USER_ID_KEY = 'guestUserId';
const AUTH_SESSION_KEY = 'authSession';
export const AUTH_SESSION_EVENT = 'travel-ui-auth-session-changed';

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
