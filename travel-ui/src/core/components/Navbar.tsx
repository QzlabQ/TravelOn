import {Button, ClickAwayListener, Popper} from "@mui/material";
// @ts-ignore
import logo from "../../assets/tourcentral.png";
import LoginIcon from "@mui/icons-material/Login";
import {Link} from "react-router-dom";
import {Bookmarks, Flight, Hotel, Person, Star, Train} from "@mui/icons-material";
import React, {useEffect, useState} from "react";
import AuthDialog from "../../account/components/AuthDialog";
import {
    AUTH_SESSION_EVENT,
    getCurrentUserSession,
    UserSession
} from "../currentUser";

export default function Navbar() {
    const [authDialogOpen, setAuthDialogOpen] = useState(false);
    const [reservationAnchorEl, setReservationAnchorEl] = React.useState<null | HTMLElement>(null);
    const [session, setSession] = useState<UserSession | null>(getCurrentUserSession());

    useEffect(() => {
        const syncSession = () => {
            setSession(getCurrentUserSession());
        };
        window.addEventListener(AUTH_SESSION_EVENT, syncSession);
        window.addEventListener("storage", syncSession);
        return () => {
            window.removeEventListener(AUTH_SESSION_EVENT, syncSession);
            window.removeEventListener("storage", syncSession);
        };
    }, []);

    const closeNavPoppers = () => {
        setReservationAnchorEl(null);
    };

    const handleReservationClick = (event: React.MouseEvent<HTMLElement>) => {
        setReservationAnchorEl(reservationAnchorEl ? null : event.currentTarget);
    };

    const reservationLinks = [
        {label: "机票预订", to: "/reservations/flights", icon: <Flight/>},
        {label: "火车票预订", to: "/reservations/trains", icon: <Train/>},
        {label: "酒店预订", to: "/reservations/hotels", icon: <Hotel/>},
        {label: "我的订单", to: "/reservations", icon: <Bookmarks/>}
    ];

    return (
        <div
            className="flex flex-row items-center justify-between mx-6 px-6 py-2 border-b-gray-200"
            style={{borderBottomWidth: 1.2}}
        >
            <Link to="/">
                <img src={logo} style={{maxHeight: "60px", pointerEvents: "none"}} alt="logo"/>
            </Link>

            <ClickAwayListener onClickAway={closeNavPoppers}>
                <ul className="flex flex-row gap-10">
                    <li className="flex flex-row items-center">
                        <Button
                            component={Link}
                            to="/clientPreferences"
                            variant="text"
                            startIcon={<Star style={{color: "#333"}}/>}
                            style={{color: "#333"}}
                        >
                            客户偏好
                        </Button>
                    </li>
                    <li className="relative flex flex-row items-center">
                        <Button
                            variant="text"
                            startIcon={<Bookmarks style={{color: "#333"}}/>}
                            style={{color: "#333"}}
                            onClick={handleReservationClick}
                        >
                            预订
                        </Button>
                        <Popper open={Boolean(reservationAnchorEl)} anchorEl={reservationAnchorEl} placement="bottom-start">
                            <div
                                className="mt-2 flex min-w-[180px] flex-col gap-1 rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-lg"
                            >
                                {reservationLinks.map((item) => (
                                    <Button
                                        key={item.to}
                                        component={Link}
                                        to={item.to}
                                        onClick={closeNavPoppers}
                                        fullWidth
                                        variant="text"
                                        startIcon={React.cloneElement(item.icon, {style: {color: "#2563eb"}})}
                                        style={{justifyContent: "flex-start", color: "#111827"}}
                                    >
                                        {item.label}
                                    </Button>
                                ))}
                            </div>
                        </Popper>
                    </li>
                    <li className="flex flex-row items-center">
                        <Button
                            component={Link}
                            to="/account"
                            variant="text"
                            startIcon={<Person style={{color: "#333"}}/>}
                            style={{color: "#333"}}
                        >
                            {session ? session.user.name : "账户"}
                        </Button>
                    </li>
                </ul>
            </ClickAwayListener>

            <div className="relative flex items-center gap-3">
                {session ?
                    <Button component={Link} to="/account" variant="contained" startIcon={<LoginIcon/>}>
                        账户中心
                    </Button>
                    :
                    <Button variant="contained" startIcon={<LoginIcon/>} onClick={() => setAuthDialogOpen(true)}>
                        登录
                    </Button>
                }
            </div>
            <AuthDialog
                open={authDialogOpen && !session}
                onClose={() => setAuthDialogOpen(false)}
                onAuthenticated={nextSession => setSession(nextSession)}
            />
        </div>
    );
}
