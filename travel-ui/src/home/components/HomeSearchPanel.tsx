import React, {useEffect, useMemo, useState} from "react";
import {Autocomplete, Button, TextField} from "@mui/material";
import {CalendarMonth, Flight, Hotel, Place, Search, SwapHoriz, Train} from "@mui/icons-material";
import {useNavigate} from "react-router-dom";
import {ApiRequests, TicketOptions} from "../../core/apiConfig";
import {Location} from "../../core/domain/DomainInterfaces";

type SearchTab = "flight" | "train" | "hotel";

const toDateInput = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const today = toDateInput(new Date());
const tomorrow = toDateInput(new Date(Date.now() + 24 * 60 * 60 * 1000));

const pickCity = (cities: string[], preferred: string[]) => {
    for (const keyword of preferred) {
        const match = cities.find(city => city.includes(keyword));
        if (match) return match;
    }
    return cities[0] ?? "";
};

const tabs: Array<{value: SearchTab, label: string, icon: React.ReactNode}> = [
    {value: "flight", label: "机票", icon: <Flight/>},
    {value: "train", label: "火车票", icon: <Train/>},
    {value: "hotel", label: "酒店", icon: <Hotel/>},
];

/** Borderless field box mimicking the reference layout: a small caption above the control. */
const FieldBox = ({label, icon, children, className = ""}: {
    label: string,
    icon?: React.ReactNode,
    children: React.ReactNode,
    className?: string,
}) => (
    <div className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 transition-colors focus-within:border-blue-500 hover:border-slate-400 ${className}`}>
        {icon && <span className="shrink-0 text-slate-400">{icon}</span>}
        <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium leading-none text-slate-400">{label}</p>
            <div className="mt-1">{children}</div>
        </div>
    </div>
);

const cityAutocompleteSx = {
    "& .MuiInput-root": {fontSize: 15, fontWeight: 600, color: "#0f172a"},
    "& .MuiInput-input": {padding: 0},
} as const;

export default function HomeSearchPanel() {
    const navigate = useNavigate();
    const [tab, setTab] = useState<SearchTab>("flight");

    const [flightOpts, setFlightOpts] = useState<TicketOptions>({departures: [], arrivals: []});
    const [trainOpts, setTrainOpts] = useState<TicketOptions>({departures: [], arrivals: []});
    const [hotelDests, setHotelDests] = useState<Location[]>([]);

    const [flight, setFlight] = useState({from: "", to: "", date: today});
    const [train, setTrain] = useState({from: "", to: "", date: today});
    const [hotel, setHotel] = useState<{dest: Location | null, checkIn: string, checkOut: string}>({
        dest: null, checkIn: today, checkOut: tomorrow,
    });
    const [error, setError] = useState("");

    useEffect(() => {
        ApiRequests.getTicketOptions("FLIGHT")
            .then(res => {
                const data = res.data;
                setFlightOpts(data);
                const from = pickCity(data.departures, ["北京"]);
                const to = pickCity(data.arrivals.filter(c => c !== from), ["上海"]);
                setFlight(current => ({...current, from, to}));
            })
            .catch(() => {});
        ApiRequests.getTicketOptions("TRAIN")
            .then(res => {
                const data = res.data;
                setTrainOpts(data);
                const from = pickCity(data.departures, ["北京"]);
                const to = pickCity(data.arrivals.filter(c => c !== from), ["上海"]);
                setTrain(current => ({...current, from, to}));
            })
            .catch(() => {});
        ApiRequests.getHotelDestinations()
            .then(res => {
                const dests = (res.data ?? []) as unknown as Location[];
                setHotelDests(dests);
                const def = dests.find(d => d.region === "北京市") ?? dests[0] ?? null;
                setHotel(current => ({...current, dest: def}));
            })
            .catch(() => {});
    }, []);

    const ticket = tab === "flight" ? flight : train;
    const ticketOpts = tab === "flight" ? flightOpts : trainOpts;
    const setTicket = tab === "flight" ? setFlight : setTrain;

    const swapTicket = () => setTicket(current => ({...current, from: current.to, to: current.from}));

    const submit = () => {
        setError("");
        if (tab === "hotel") {
            if (!hotel.dest) {setError("请选择目的地城市。"); return;}
            if (hotel.checkOut <= hotel.checkIn) {setError("退房日期必须晚于入住日期。"); return;}
            navigate("/reservations/hotels", {
                state: {destinationId: hotel.dest.idLocation, dateFrom: hotel.checkIn, dateTo: hotel.checkOut},
            });
            return;
        }
        if (!ticket.from || !ticket.to) {setError("请选择出发城市和到达城市。"); return;}
        if (ticket.from === ticket.to) {setError("出发城市与到达城市不能相同。"); return;}
        navigate(tab === "flight" ? "/reservations/flights" : "/reservations/trains", {
            state: {from: ticket.from, to: ticket.to, departureDate: ticket.date},
        });
    };

    const hotelLabel = useMemo(
        () => (option: Location) => `${option.region}`,
        [],
    );

    return (
        <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6">
            {/* Tabs */}
            <div className="flex items-center justify-center gap-8 border-b border-slate-100 pb-4">
                {tabs.map(item => {
                    const active = tab === item.value;
                    return (
                        <button
                            key={item.value}
                            type="button"
                            onClick={() => {setTab(item.value); setError("");}}
                            className={`relative flex flex-col items-center gap-1 px-1 pb-2 text-sm font-semibold transition-colors ${active ? "text-blue-600" : "text-slate-500 hover:text-slate-800"}`}
                        >
                            <span className={active ? "text-blue-600" : "text-slate-400"}>{item.icon}</span>
                            {item.label}
                            {active && <span className="absolute -bottom-[1px] left-0 h-0.5 w-full rounded-full bg-blue-600"/>}
                        </button>
                    );
                })}
            </div>

            {/* Search row */}
            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-stretch">
                {tab === "hotel" ? (
                    <>
                        <FieldBox label="目的地" icon={<Place fontSize="small"/>} className="lg:flex-[2]">
                            <Autocomplete
                                options={hotelDests}
                                value={hotel.dest}
                                getOptionLabel={hotelLabel}
                                isOptionEqualToValue={(o, v) => o.idLocation === v.idLocation}
                                onChange={(_, value) => setHotel(current => ({...current, dest: value}))}
                                noOptionsText="没有匹配城市"
                                renderInput={params => (
                                    <TextField {...params} variant="standard" placeholder="选择城市"
                                               InputProps={{...params.InputProps, disableUnderline: true}}/>
                                )}
                                sx={cityAutocompleteSx}
                            />
                        </FieldBox>
                        <FieldBox label="入住" icon={<CalendarMonth fontSize="small"/>}>
                            <input
                                type="date" value={hotel.checkIn} min={today}
                                onChange={e => setHotel(current => ({
                                    ...current,
                                    checkIn: e.target.value,
                                    checkOut: current.checkOut <= e.target.value
                                        ? toDateInput(new Date(new Date(e.target.value).getTime() + 24 * 60 * 60 * 1000))
                                        : current.checkOut,
                                }))}
                                className="w-full bg-transparent text-[15px] font-semibold text-slate-900 outline-none"
                            />
                        </FieldBox>
                        <FieldBox label="退房" icon={<CalendarMonth fontSize="small"/>}>
                            <input
                                type="date" value={hotel.checkOut} min={hotel.checkIn}
                                onChange={e => setHotel(current => ({...current, checkOut: e.target.value}))}
                                className="w-full bg-transparent text-[15px] font-semibold text-slate-900 outline-none"
                            />
                        </FieldBox>
                    </>
                ) : (
                    <>
                        <FieldBox label="出发城市" icon={<Place fontSize="small"/>}>
                            <Autocomplete
                                options={ticketOpts.departures}
                                value={ticket.from || null}
                                onChange={(_, value) => setTicket(current => ({...current, from: value ?? ""}))}
                                noOptionsText="没有匹配城市"
                                renderInput={params => (
                                    <TextField {...params} variant="standard" placeholder="选择城市"
                                               InputProps={{...params.InputProps, disableUnderline: true}}/>
                                )}
                                sx={cityAutocompleteSx}
                            />
                        </FieldBox>
                        <button
                            type="button"
                            onClick={swapTicket}
                            aria-label="交换出发与到达城市"
                            className="flex shrink-0 items-center justify-center self-center rounded-full border border-slate-300 p-2 text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-600"
                        >
                            <SwapHoriz fontSize="small"/>
                        </button>
                        <FieldBox label="到达城市" icon={<Place fontSize="small"/>}>
                            <Autocomplete
                                options={ticketOpts.arrivals}
                                value={ticket.to || null}
                                onChange={(_, value) => setTicket(current => ({...current, to: value ?? ""}))}
                                noOptionsText="没有匹配城市"
                                renderInput={params => (
                                    <TextField {...params} variant="standard" placeholder="选择城市"
                                               InputProps={{...params.InputProps, disableUnderline: true}}/>
                                )}
                                sx={cityAutocompleteSx}
                            />
                        </FieldBox>
                        <FieldBox label="出发日期" icon={<CalendarMonth fontSize="small"/>}>
                            <input
                                type="date" value={ticket.date} min={today}
                                onChange={e => setTicket(current => ({...current, date: e.target.value}))}
                                className="w-full bg-transparent text-[15px] font-semibold text-slate-900 outline-none"
                            />
                        </FieldBox>
                    </>
                )}

                <Button
                    variant="contained"
                    onClick={submit}
                    startIcon={<Search/>}
                    sx={{
                        borderRadius: "9999px",
                        px: 4,
                        fontWeight: 600,
                        textTransform: "none",
                        whiteSpace: "nowrap",
                        boxShadow: "0 4px 14px rgba(37,99,235,0.3)",
                    }}
                >
                    搜索
                </Button>
            </div>

            {error && <p className="mt-3 text-center text-sm text-red-500">{error}</p>}
        </div>
    );
}
