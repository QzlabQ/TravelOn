import {useEffect, useState} from "react";
import {ApiRequests} from "./apiConfig";
import {
    BOOKING_PREFERENCES_EVENT,
    DEFAULT_BOOKING_PREFERENCES,
    getBookingPreferences,
    getCurrentUserSession,
    BookingPreferences,
} from "./currentUser";
import {useAuthSession} from "./useAuthSession";

export const useBookingPreferences = () => {
    const session = useAuthSession();
    const [preferences, setPreferences] = useState<BookingPreferences>(getBookingPreferences());
    const [loading, setLoading] = useState(Boolean(session));

    useEffect(() => {
        let active = true;
        if (!session) {
            setPreferences(getBookingPreferences());
            setLoading(false);
            return () => { active = false; };
        }

        setLoading(true);
        ApiRequests.getBookingPreferences(session.token)
            .then(response => {
                if (!active) return;
                setPreferences(response.status === 204 ? DEFAULT_BOOKING_PREFERENCES : response.data);
            })
            .catch(() => {
                if (active) setPreferences(getBookingPreferences() || DEFAULT_BOOKING_PREFERENCES);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => { active = false; };
    }, [session?.token]);

    useEffect(() => {
        const syncLocalFallback = () => {
            if (!getCurrentUserSession()) setPreferences(getBookingPreferences());
        };
        window.addEventListener(BOOKING_PREFERENCES_EVENT, syncLocalFallback);
        return () => window.removeEventListener(BOOKING_PREFERENCES_EVENT, syncLocalFallback);
    }, []);

    return {preferences, loading};
};
