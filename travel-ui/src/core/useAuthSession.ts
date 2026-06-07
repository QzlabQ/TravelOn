import {useEffect, useState} from "react";
import {AUTH_SESSION_EVENT, getCurrentUserSession, UserSession} from "./currentUser";

export const useAuthSession = () => {
    const [session, setSession] = useState<UserSession | null>(getCurrentUserSession());

    useEffect(() => {
        const syncSession = () => setSession(getCurrentUserSession());
        window.addEventListener(AUTH_SESSION_EVENT, syncSession);
        window.addEventListener("storage", syncSession);

        return () => {
            window.removeEventListener(AUTH_SESSION_EVENT, syncSession);
            window.removeEventListener("storage", syncSession);
        };
    }, []);

    return session;
};
