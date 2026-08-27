import {Avatar, Button, ClickAwayListener, Popper, Tooltip} from "@mui/material";
// @ts-ignore
import logo from "../../assets/main_logo.png";
import LoginIcon from "@mui/icons-material/Login";
import {Link, useLocation} from "react-router-dom";
import {
    AutoAwesome,
    Bookmarks,
    EventNote,
    Flight,
    Forum,
    Hotel,
    KeyboardArrowDown,
    KeyboardArrowRight,
    Train
} from "@mui/icons-material";
import React, {useEffect, useState} from "react";
import AuthDialog from "../../account/components/AuthDialog";
import {
    AUTH_SESSION_EVENT,
    getCurrentUserSession,
    UserSession
} from "../currentUser";
import {resolveCommunityImageUrl} from "../apiConfig";

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
        {label: "我的预订", to: "/reservations", icon: <Bookmarks/>},
        {label: "我的行程", to: "/reservations/timeline", icon: <EventNote/>}
    ];

    const location = useLocation();
    const isActive = (path: string) =>
        path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

    // Shared pill styling for the top-level nav items, with an active (current page) state.
    const navItemSx = (active: boolean) => ({
        textTransform: "none" as const,
        borderRadius: "9999px",
        px: 2.5,
        py: 1.1,
        fontSize: 17,
        fontWeight: 500,
        gap: 0.5,
        color: active ? "#2563eb" : "#334155",
        backgroundColor: active ? "#eff6ff" : "transparent",
        transition: "all .15s ease",
        "& .MuiButton-startIcon": {color: active ? "#2563eb" : "#64748b"},
        "& .MuiButton-startIcon > svg, & .MuiButton-endIcon > svg": {fontSize: 23},
        "&:hover": {
            backgroundColor: active ? "#e0ecff" : "#f1f5f9",
            color: active ? "#1d4ed8" : "#0f172a",
        },
    });

    return (
        <div
            className="flex flex-col items-center gap-3 border-b border-slate-200 px-4 py-3 shadow-[0_6px_18px_-10px_rgba(15,23,42,0.28)] lg:px-8 xl:flex-row xl:justify-between"
        >
            <Link to="/" className="shrink-0">
                <img src={logo} style={{maxHeight: "60px", pointerEvents: "none"}} alt="TourCentral"/>
            </Link>

            <ClickAwayListener onClickAway={closeNavPoppers}>
                <ul className="flex w-full flex-wrap items-center justify-center gap-1 md:gap-2 xl:w-auto xl:gap-3">
                    <li className="flex flex-row items-center">
                        <Button
                            component={Link}
                            to="/ai-planner"
                            disableElevation
                            startIcon={<AutoAwesome/>}
                            sx={navItemSx(isActive("/ai-planner"))}
                        >
                            AI规划
                        </Button>
                    </li>
                    <li className="flex flex-row items-center">
                        <Button
                            component={Link}
                            to="/community"
                            disableElevation
                            startIcon={<Forum/>}
                            sx={navItemSx(isActive("/community"))}
                        >
                            社区
                        </Button>
                    </li>
                    <li className="relative flex flex-row items-center">
                        <Button
                            disableElevation
                            startIcon={<Bookmarks/>}
                            endIcon={
                                <KeyboardArrowDown
                                    sx={{
                                        transition: "transform .2s ease",
                                        transform: reservationAnchorEl ? "rotate(180deg)" : "none",
                                    }}
                                />
                            }
                            onClick={handleReservationClick}
                            sx={navItemSx(isActive("/reservations"))}
                        >
                            预订
                        </Button>
                        <Popper open={Boolean(reservationAnchorEl)} anchorEl={reservationAnchorEl} placement="bottom-start" style={{zIndex: 30}}>
                            <div
                                className="mt-2 flex min-w-44 flex-col gap-0.5 rounded-xl border border-slate-100 bg-white p-2 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)]"
                            >
                                {reservationLinks.map((item) => {
                                    const active = location.pathname === item.to;
                                    return (
                                        <Button
                                            key={item.to}
                                            component={Link}
                                            to={item.to}
                                            onClick={closeNavPoppers}
                                            fullWidth
                                            disableElevation
                                            startIcon={item.icon}
                                            sx={{
                                                justifyContent: "flex-start",
                                                textTransform: "none",
                                                borderRadius: "10px",
                                                px: 1.5,
                                                py: 1,
                                                fontWeight: 500,
                                                color: active ? "#1d4ed8" : "#111827",
                                                backgroundColor: active ? "#eff6ff" : "transparent",
                                                "& .MuiButton-startIcon": {color: "#2563eb"},
                                                "&:hover": {backgroundColor: "#f1f5f9"},
                                            }}
                                        >
                                            {item.label}
                                        </Button>
                                    );
                                })}
                            </div>
                        </Popper>
                    </li>
                </ul>
            </ClickAwayListener>

            <div className="relative flex items-center gap-3">
                {session ?
                    <Tooltip title="进入账户中心" arrow>
                        <Button
                            component={Link}
                            to="/account"
                            disableElevation
                            sx={{
                                textTransform: "none",
                                borderRadius: "9999px",
                                pl: 0.75,
                                pr: 1.25,
                                py: 0.5,
                                gap: 1,
                                color: "#0f172a",
                                bgcolor: "#fff",
                                border: "1px solid #e2e8f0",
                                boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
                                transition: "all .15s ease",
                                "&:hover": {
                                    bgcolor: "#f8fafc",
                                    borderColor: "#bfdbfe",
                                    boxShadow: "0 2px 8px rgba(37,99,235,0.12)",
                                },
                            }}
                        >
                            <Avatar
                                src={resolveCommunityImageUrl(session.user.avatarUrl) || undefined}
                                sx={{
                                    width: 30,
                                    height: 30,
                                    fontSize: 14,
                                    fontWeight: 700,
                                    background: "linear-gradient(135deg,#3b82f6,#2563eb)",
                                }}
                            >
                                {(session.user.name || "U").trim().slice(0, 1).toUpperCase()}
                            </Avatar>
                            <span className="flex max-w-[140px] flex-col items-start leading-tight">
                                <span className="truncate text-[13px] font-semibold">
                                    {session.user.name || "我的账户"}
                                </span>
                                <span className="text-[11px] font-medium text-slate-400">我的账户</span>
                            </span>
                            <KeyboardArrowRight sx={{fontSize: 18, color: "#94a3b8"}}/>
                        </Button>
                    </Tooltip>
                    :
                    <Button
                        variant="contained"
                        startIcon={<LoginIcon/>}
                        onClick={() => setAuthDialogOpen(true)}
                        disableElevation
                        sx={{
                            textTransform: "none",
                            borderRadius: "9999px",
                            px: 2.5,
                            py: 0.75,
                            fontWeight: 600,
                            boxShadow: "0 2px 8px rgba(37,99,235,0.25)",
                        }}
                    >
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
