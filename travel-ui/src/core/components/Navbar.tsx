import {Badge, Button, ClickAwayListener, IconButton, Popper} from "@mui/material";
// @ts-ignore
import logo from "../../assets/tourcentral.png";
import LoginIcon from "@mui/icons-material/Login";
import {Link} from "react-router-dom";
import {
    Apartment,
    AutoAwesome,
    Bookmarks,
    Explore,
    Flight,
    Hotel,
    Notifications,
    Person,
    Star,
    Train
} from "@mui/icons-material";
import React, {useEffect, useState} from "react";
import AuthDialog from "../../account/components/AuthDialog";
import {
    AUTH_SESSION_EVENT,
    getCurrentUserSession,
    getNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    NOTIFICATIONS_EVENT,
    UserSession
} from "../currentUser";

const formatNotificationTime = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

export default function Navbar() {
    const [authDialogOpen, setAuthDialogOpen] = useState(false);
    const [reservationAnchorEl, setReservationAnchorEl] = React.useState<null | HTMLElement>(null);
    const [notificationAnchorEl, setNotificationAnchorEl] = React.useState<null | HTMLElement>(null);
    const [session, setSession] = useState<UserSession | null>(getCurrentUserSession());
    const [notifications, setNotifications] = useState(() => getNotifications());

    useEffect(() => {
        const syncSession = () => {
            setSession(getCurrentUserSession());
            setNotifications(getNotifications());
        };
        window.addEventListener(AUTH_SESSION_EVENT, syncSession);
        window.addEventListener("storage", syncSession);
        return () => {
            window.removeEventListener(AUTH_SESSION_EVENT, syncSession);
            window.removeEventListener("storage", syncSession);
        };
    }, []);

    useEffect(() => {
        const syncNotifications = () => setNotifications(getNotifications());
        window.addEventListener(NOTIFICATIONS_EVENT, syncNotifications);
        window.addEventListener("storage", syncNotifications);
        return () => {
            window.removeEventListener(NOTIFICATIONS_EVENT, syncNotifications);
            window.removeEventListener("storage", syncNotifications);
        };
    }, []);

    const closeNavPoppers = () => {
        setReservationAnchorEl(null);
        setNotificationAnchorEl(null);
    };

    const handleReservationClick = (event: React.MouseEvent<HTMLElement>) => {
        setReservationAnchorEl(reservationAnchorEl ? null : event.currentTarget);
    };

    const handleNotificationClick = (event: React.MouseEvent<HTMLElement>) => {
        setNotificationAnchorEl(notificationAnchorEl ? null : event.currentTarget);
    };

    const markAllRead = () => {
        setNotifications(markAllNotificationsRead());
    };

    const unreadCount = notifications.filter(notification => !notification.read).length;

    const reservationLinks = [
        {label: "机票预订", to: "/reservations/flights", icon: <Flight/>},
        {label: "火车票预订", to: "/reservations/trains", icon: <Train/>},
        {label: "酒店预订", to: "/reservations/hotels", icon: <Hotel/>},
        {label: "我的预订", to: "/reservations", icon: <Bookmarks/>}
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
                <ul className="flex flex-row gap-12">
                    <li className="flex flex-row items-center">
                        <Link to="/offers">
                            <Button
                                variant="text"
                                startIcon={<Explore style={{color: "#333"}}/>}
                                style={{color: "#333"}}
                            >
                                旅游产品
                            </Button>
                        </Link>
                    </li>
                    <li className="flex flex-row items-center">
                        <Link to="/clientPreferences">
                            <Button
                                variant="text"
                                startIcon={<Star style={{color: "#333"}}/>}
                                style={{color: "#333"}}
                            >
                                客户偏好
                            </Button>
                        </Link>
                    </li>
                    <li className="flex flex-row items-center">
                        <Link to="/TOUpdates">
                            <Button
                                variant="text"
                                startIcon={<Apartment style={{color: "#333"}}/>}
                                style={{color: "#333"}}
                            >
                                运营商更新
                            </Button>
                        </Link>
                    </li>
                    <li className="flex flex-row items-center">
                        <Link to="/ai-planner">
                            <Button
                                variant="text"
                                startIcon={<AutoAwesome style={{color: "#333"}}/>}
                                style={{color: "#333"}}
                            >
                                AI规划
                            </Button>
                        </Link>
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
                                className="flex flex-col gap-1 px-3 py-3 mt-2 bg-white border-gray-200 rounded-xl shadow-lg"
                                style={{borderWidth: 0.5, minWidth: 160}}
                            >
                                {reservationLinks.map((item) => (
                                    <Link key={item.to} to={item.to} onClick={closeNavPoppers}>
                                        <Button
                                            fullWidth
                                            variant="text"
                                            startIcon={React.cloneElement(item.icon, {style: {color: "#2563eb"}})}
                                            style={{justifyContent: "flex-start", color: "#111827"}}
                                        >
                                            {item.label}
                                        </Button>
                                    </Link>
                                ))}
                            </div>
                        </Popper>
                    </li>
                    <li className="flex flex-row items-center">
                        <Link to="/account">
                            <Button
                                variant="text"
                                startIcon={<Person style={{color: "#333"}}/>}
                                style={{color: "#333"}}
                            >
                                {session ? session.user.name : "账户"}
                            </Button>
                        </Link>
                    </li>
                </ul>
            </ClickAwayListener>

            <div className="relative flex items-center gap-3">
                <IconButton onClick={handleNotificationClick} color={unreadCount > 0 ? "primary" : "default"}>
                    <Badge badgeContent={unreadCount} color="error">
                        <Notifications/>
                    </Badge>
                </IconButton>
                <Popper open={Boolean(notificationAnchorEl)} anchorEl={notificationAnchorEl} placement="bottom-end" style={{zIndex: 1300}}>
                    <div
                        className="mt-2 w-80 rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
                    >
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="font-semibold text-gray-900">站内通知</p>
                            <Button size="small" onClick={markAllRead} disabled={notifications.length === 0}>全部已读</Button>
                        </div>
                        <div className="grid max-h-96 gap-2 overflow-y-auto">
                            {notifications.slice(0, 8).map(notification => (
                                <Link
                                    key={notification.id}
                                    to={notification.reservationId ? `/reservations/${notification.reservationId}` : "/reservations"}
                                    onClick={() => {
                                        markNotificationRead(notification.id);
                                        setNotifications(getNotifications());
                                        setNotificationAnchorEl(null);
                                    }}
                                >
                                    <div className={`rounded-lg px-3 py-2 text-sm ${notification.read ? "bg-slate-50" : "bg-blue-50"}`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="font-semibold text-gray-900">{notification.title}</p>
                                            {!notification.read && <span className="mt-1 h-2 w-2 rounded-full bg-blue-500"/>}
                                        </div>
                                        <p className="mt-1 text-gray-600">{notification.message}</p>
                                        <p className="mt-1 text-xs text-gray-400">{formatNotificationTime(notification.createdAt)}</p>
                                    </div>
                                </Link>
                            ))}
                            {notifications.length === 0 &&
                                <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-gray-500">暂无通知</p>
                            }
                        </div>
                    </div>
                </Popper>
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
