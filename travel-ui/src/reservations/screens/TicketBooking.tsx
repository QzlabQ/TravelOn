import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  LinearProgress,
  Pagination,
  Slider,
  Snackbar,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import {
  ArrowForward,
  CheckCircle,
  Flight,
  Search,
  SwapHoriz,
  Train,
  Tune,
} from "@mui/icons-material";
import { ApiRequests, TicketSearchOffer } from "../../core/apiConfig";
import { BookingPersonPayload } from "../../core/apiConfig";
import {
  addNotification,
  getBookingPreferences,
  getCurrentUserId,
} from "../../core/currentUser";
import TravelerSelector from "../../account/components/TravelerSelector";
import { Link, useLocation, useNavigate } from "react-router-dom";
import CheckoutConfirmDialog from "../components/CheckoutConfirmDialog";
import { useAuthSession } from "../../core/useAuthSession";
import { validateTicketTravelerRules } from "../../core/validation";

type TicketMode = "flight" | "train";

type TicketBookingProps = {
  mode: TicketMode;
};

const modeConfig = {
  flight: {
    title: "机票订票与比价",
    eyebrow: "航班服务",
    icon: <Flight style={{ fontSize: 18 }} />,
    fromLabel: "出发机场/城市",
    toLabel: "到达机场/城市",
    lowPrice: 0,
    highPrice: 3600,
    codePrefix: "CA",
    hero: "比较直飞、联程与不同舱位价格",
    accent: "#2563eb",
  },
  train: {
    title: "火车票订票与比价",
    eyebrow: "铁路服务",
    icon: <Train style={{ fontSize: 18 }} />,
    fromLabel: "出发站/城市",
    toLabel: "到达站/城市",
    lowPrice: 0,
    highPrice: 2200,
    codePrefix: "G",
    hero: "筛选高铁、动车与普速列车",
    accent: "#0f766e",
  },
};

const today = new Date().toISOString().slice(0, 10);
const TICKET_PAGE_SIZE = 8;
const popularRoutes: Record<TicketMode, Array<{ from: string; to: string }>> = {
  flight: [
    { from: "北京", to: "上海" },
    { from: "上海", to: "广州" },
    { from: "深圳", to: "成都" },
    { from: "杭州", to: "西安" },
    { from: "重庆", to: "三亚" },
    { from: "南京", to: "厦门" },
  ],
  train: [
    { from: "北京", to: "沈阳" },
    { from: "北京", to: "上海" },
    { from: "上海", to: "南京" },
    { from: "广州", to: "深圳" },
    { from: "成都", to: "重庆" },
    { from: "武汉", to: "长沙" },
  ],
};

type TrainTypeFilter = "GC" | "D" | "T" | "K" | "Z" | "OTHER";

type TrainOfferGroup = {
  key: string;
  offers: TicketSearchOffer[];
  order: number;
};

const trainTypeFilters: Array<{ label: string; value: TrainTypeFilter }> = [
  { label: "G/C", value: "GC" },
  { label: "D", value: "D" },
  { label: "T", value: "T" },
  { label: "K", value: "K" },
  { label: "Z", value: "Z" },
  { label: "其他", value: "OTHER" },
];
const defaultTrainTypeFilters = trainTypeFilters.map((item) => item.value);

type TicketRebookState = {
  routeFrom?: string | null;
  routeTo?: string | null;
  departureDate?: string | null;
  bookingCode?: string | null;
};

const findPreferredCity = (cities: string[], keyword: string) => {
  return cities.find((city) => city.includes(keyword));
};

const isTrainTypeFilter = (value: string): value is TrainTypeFilter => {
  return defaultTrainTypeFilters.includes(value as TrainTypeFilter);
};

const getTrainTypeGroup = (code: string): TrainTypeFilter => {
  const firstLetter = code.trim().toUpperCase().charAt(0);
  if (firstLetter === "G" || firstLetter === "C") return "GC";
  if (firstLetter === "D") return "D";
  if (firstLetter === "T") return "T";
  if (firstLetter === "K") return "K";
  if (firstLetter === "Z") return "Z";
  return "OTHER";
};

const getTrainOfferGroupKey = (offer: TicketSearchOffer) =>
  [
    offer.code,
    offer.departureCity,
    offer.arrivalCity,
    offer.departureTime,
    offer.arrivalTime,
    offer.carrier,
  ].join("::");

const getTrainSeatRank = (seatClass: string) => {
  const normalizedSeatClass = seatClass.replace(/\s/g, "");
  if (normalizedSeatClass.includes("商务")) return 0;
  if (normalizedSeatClass.includes("特等")) return 1;
  if (normalizedSeatClass.includes("一等")) return 2;
  if (normalizedSeatClass.includes("二等")) return 3;
  if (normalizedSeatClass.includes("动卧")) return 4;
  if (normalizedSeatClass.includes("高级软卧")) return 5;
  if (normalizedSeatClass.includes("软卧")) return 6;
  if (normalizedSeatClass.includes("硬卧")) return 7;
  if (normalizedSeatClass.includes("软座")) return 8;
  if (normalizedSeatClass.includes("硬座")) return 9;
  if (normalizedSeatClass.includes("无座")) return 10;
  return 11;
};

const buildTrainOfferGroups = (
  offers: TicketSearchOffer[],
): TrainOfferGroup[] => {
  const groupedOffers = new Map<string, TrainOfferGroup>();

  offers.forEach((offer, index) => {
    const groupKey = getTrainOfferGroupKey(offer);
    const existingGroup = groupedOffers.get(groupKey);
    if (existingGroup) {
      existingGroup.offers.push(offer);
      return;
    }
    groupedOffers.set(groupKey, {
      key: groupKey,
      offers: [offer],
      order: index,
    });
  });

  return Array.from(groupedOffers.values())
    .sort((left, right) => left.order - right.order)
    .map((group) => ({
      ...group,
      offers: group.offers.slice().sort((left, right) => {
        const rankDiff =
          getTrainSeatRank(left.seatClass) - getTrainSeatRank(right.seatClass);
        if (rankDiff !== 0) {
          return rankDiff;
        }
        return left.price - right.price;
      }),
    }));
};

const formatTicketClock = (value: string) => {
  const trimmedValue = value?.trim() ?? "";
  const isoMatch = trimmedValue.match(/T(\d{2}:\d{2})/);
  if (isoMatch) return isoMatch[1];

  const timeMatch = trimmedValue.match(/^(\d{1,2}:\d{2})/);
  if (timeMatch) {
    const [hour, minute] = timeMatch[1].split(":");
    return `${hour.padStart(2, "0")}:${minute}`;
  }

  return trimmedValue;
};

const formatTicketDate = (value: string) => {
  const trimmedValue = value?.trim() ?? "";
  const isoMatch = trimmedValue.match(/^(\d{4}-\d{2}-\d{2})T/);
  return isoMatch ? isoMatch[1] : "";
};

const formatTicketTimeRange = (offer: TicketSearchOffer) => {
  return `${formatTicketClock(offer.departureTime)} - ${formatTicketClock(offer.arrivalTime)}`;
};

const TicketCard = ({
  offer,
  mode,
  compact = false,
  onReserve,
  reserving = false,
  canReserve = true,
  disabledLabel,
  selected = false,
}: {
  offer: TicketSearchOffer;
  mode: TicketMode;
  compact?: boolean;
  onReserve?: (offer: TicketSearchOffer) => void;
  reserving?: boolean;
  canReserve?: boolean;
  disabledLabel?: string;
  selected?: boolean;
}) => {
  const config = modeConfig[mode];
  const departureStation = [
    offer.departureStationCode,
    offer.departureTerminalName,
  ]
    .filter(Boolean)
    .join(" ");
  const arrivalStation = [offer.arrivalStationCode, offer.arrivalTerminalName]
    .filter(Boolean)
    .join(" ");
  const departureDateLabel = formatTicketDate(offer.departureTime);
  const arrivalDateLabel = formatTicketDate(offer.arrivalTime);

  return (
    <div
      className={`bg-white rounded-lg border ${selected ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"} ${compact ? "w-full" : "min-w-[760px]"} p-5 shadow-sm hover:shadow-md transition-shadow`}
    >
      <div className="flex items-start justify-between gap-5">
        <Chip
          size="small"
          icon={<CheckCircle />}
          label={`成功率 ${offer.successRate}`}
          sx={{ backgroundColor: "#ecfdf5", color: "#047857" }}
        />
        <p className="text-xs text-orange-500">{offer.notice}</p>
      </div>

      <div className="mt-5 flex flex-row items-center gap-5">
        <div className="w-28">
          <p className="text-3xl font-bold" style={{ color: config.accent }}>
            {formatTicketClock(offer.departureTime)}
          </p>
          {departureDateLabel && (
            <p className="mt-1 text-xs text-slate-400">{departureDateLabel}</p>
          )}
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {departureStation}
          </p>
        </div>
        <div className="flex-1 flex flex-col items-center text-slate-500">
          <p className="text-sm">{offer.duration}</p>
          <div className="my-2 flex flex-row items-center w-full gap-2">
            <div className="h-px bg-slate-300 flex-1" />
            <Chip size="small" label={offer.code} variant="outlined" />
            <div className="h-px bg-slate-300 flex-1" />
          </div>
          <p className="text-xs">
            {offer.carrier} · {offer.seatClass}
          </p>
        </div>
        <div className="w-28">
          <p className="text-3xl font-bold text-slate-900">
            {formatTicketClock(offer.arrivalTime)}
          </p>
          {arrivalDateLabel && (
            <p className="mt-1 text-xs text-slate-400">{arrivalDateLabel}</p>
          )}
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {arrivalStation}
          </p>
        </div>
        <div className="w-32 text-right">
          <p className="text-sm text-slate-400">参考价</p>
          <p className="text-3xl font-bold text-orange-500">¥{offer.price}</p>
          <p className="mt-1 text-xs text-slate-500">
            余票 {offer.remainingSeats}/{offer.totalSeats}
          </p>
        </div>
        <Button
          variant="contained"
          size="large"
          sx={{ borderRadius: 2 }}
          disabled={reserving || !canReserve}
          onClick={() => onReserve?.(offer)}
        >
          {!canReserve
            ? (disabledLabel ?? "不可选择")
            : reserving
              ? "提交中"
              : selected
                ? "继续订票"
                : "去订票"}
        </Button>
      </div>
    </div>
  );
};

const TrainTicketCard = ({
  group,
  displayedOffer,
  onSeatChange,
  onReserve,
  reserving = false,
  canReserve = true,
  disabledLabel,
  selected = false,
}: {
  group: TrainOfferGroup;
  displayedOffer: TicketSearchOffer;
  onSeatChange: (offer: TicketSearchOffer) => void;
  onReserve?: (offer: TicketSearchOffer) => void;
  reserving?: boolean;
  canReserve?: boolean;
  disabledLabel?: string;
  selected?: boolean;
}) => {
  const config = modeConfig.train;
  const minPrice = Math.min(...group.offers.map((offer) => offer.price));
  const departureDateLabel = formatTicketDate(displayedOffer.departureTime);
  const arrivalDateLabel = formatTicketDate(displayedOffer.arrivalTime);

  return (
    <div
      className={`bg-white rounded-lg border ${selected ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"} p-5 shadow-sm hover:shadow-md transition-shadow`}
    >
      <div className="flex items-start justify-between gap-5">
        <Chip
          size="small"
          icon={<CheckCircle />}
          label={`成功率 ${displayedOffer.successRate}`}
          sx={{ backgroundColor: "#ecfdf5", color: "#047857" }}
        />
        <p className="text-xs text-orange-500">{displayedOffer.notice}</p>
      </div>

      <div className="mt-5 flex flex-row items-center gap-5">
        <div className="w-28">
          <p className="text-3xl font-bold" style={{ color: config.accent }}>
            {formatTicketClock(displayedOffer.departureTime)}
          </p>
          {departureDateLabel && (
            <p className="mt-1 text-xs text-slate-400">{departureDateLabel}</p>
          )}
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {[
              displayedOffer.departureStationCode,
              displayedOffer.departureTerminalName,
            ]
              .filter(Boolean)
              .join(" ")}
          </p>
        </div>
        <div className="flex-1 flex flex-col items-center text-slate-500">
          <p className="text-sm">{displayedOffer.duration}</p>
          <div className="my-2 flex flex-row items-center w-full gap-2">
            <div className="h-px bg-slate-300 flex-1" />
            <Chip size="small" label={displayedOffer.code} variant="outlined" />
            <div className="h-px bg-slate-300 flex-1" />
          </div>
          <p className="text-xs">
            {displayedOffer.carrier} · 当前席别 {displayedOffer.seatClass}
          </p>
        </div>
        <div className="w-28">
          <p className="text-3xl font-bold text-slate-900">
            {formatTicketClock(displayedOffer.arrivalTime)}
          </p>
          {arrivalDateLabel && (
            <p className="mt-1 text-xs text-slate-400">{arrivalDateLabel}</p>
          )}
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {[
              displayedOffer.arrivalStationCode,
              displayedOffer.arrivalTerminalName,
            ]
              .filter(Boolean)
              .join(" ")}
          </p>
        </div>
        <div className="w-36 text-right">
          <p className="text-sm text-slate-400">
            {group.offers.length > 1 ? "当前席别价格" : "参考价"}
          </p>
          <p className="text-3xl font-bold text-orange-500">
            ¥{displayedOffer.price}
          </p>
          {group.offers.length > 1 && (
            <p className="mt-1 text-xs text-slate-400">最低 ¥{minPrice} 起</p>
          )}
        </div>
        <Button
          variant="contained"
          size="large"
          sx={{ borderRadius: 2 }}
          disabled={reserving || !canReserve}
          onClick={() => onReserve?.(displayedOffer)}
        >
          {!canReserve
            ? (disabledLabel ?? "不可选择")
            : reserving
              ? "提交中"
              : selected
                ? "继续订票"
                : "去订票"}
        </Button>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">可选席别</p>
          <p className="text-xs text-slate-500">
            同车次可直接切换席别查看价格与余票
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {group.offers.map((offer) => {
            const active = offer.id === displayedOffer.id;
            return (
              <button
                key={offer.id}
                type="button"
                onClick={() => onSeatChange(offer)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${active ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}
              >
                <div className="text-sm font-semibold">{offer.seatClass}</div>
                <div className="mt-1 text-xs">
                  ¥{offer.price} · 余票 {offer.remainingSeats}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const TicketBooking = ({ mode }: TicketBookingProps) => {
  const config = modeConfig[mode];
  const navigate = useNavigate();
  const location = useLocation();
  const session = useAuthSession();
  const isAuthenticated = Boolean(session);
  const rebookState = (location.state ?? {}) as TicketRebookState;
  const bookingPreferences = useMemo(() => getBookingPreferences(), []);
  const preferredTrainTypeFilters =
    bookingPreferences.preferredTrainTypes.filter(isTrainTypeFilter);
  const navigateTimerRef = useRef<number | null>(null);
  const checkoutSectionRef = useRef<HTMLDivElement | null>(null);
  const checkoutSummaryRef = useRef<HTMLDivElement | null>(null);
  const [departures, setDepartures] = useState<string[]>([]);
  const [arrivals, setArrivals] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(rebookState.departureDate ?? today);
  const [sortBy, setSortBy] = useState("departure");
  const [priceRange, setPriceRange] = useState<number[]>([
    config.lowPrice,
    config.highPrice,
  ]);
  const [studentOnly, setStudentOnly] = useState(false);
  const [onlyAvailable, setOnlyAvailable] = useState(
    bookingPreferences.onlyAvailableTickets,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [bookingId, setBookingId] = useState("");
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingError, setBookingError] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);
  const [reservationId, setReservationId] = useState("");
  const [selectedTravelers, setSelectedTravelers] = useState<
    BookingPersonPayload[]
  >([]);
  const [checkoutConfirmOpen, setCheckoutConfirmOpen] = useState(false);
  const [ticketOffers, setTicketOffers] = useState<TicketSearchOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<TicketSearchOffer | null>(
    null,
  );
  const [hasLoadedOptions, setHasLoadedOptions] = useState(false);
  const [resultPage, setResultPage] = useState(1);
  const [selectedTrainTypes, setSelectedTrainTypes] = useState<
    TrainTypeFilter[]
  >(
    preferredTrainTypeFilters.length > 0
      ? preferredTrainTypeFilters
      : defaultTrainTypeFilters,
  );
  const [trainCodeQuery, setTrainCodeQuery] = useState(
    rebookState.bookingCode ?? "",
  );
  const [trainSeatSelections, setTrainSeatSelections] = useState<
    Record<string, string>
  >({});

  const offers = useMemo(() => {
    if (mode !== "train") return ticketOffers;
    const normalizedTrainCodeQuery = trainCodeQuery.trim().toUpperCase();
    return ticketOffers.filter((offer) => {
      const normalizedOfferCode = offer.code.toUpperCase();
      return (
        selectedTrainTypes.includes(getTrainTypeGroup(offer.code)) &&
        (!normalizedTrainCodeQuery ||
          normalizedOfferCode.includes(normalizedTrainCodeQuery))
      );
    });
  }, [mode, selectedTrainTypes, ticketOffers, trainCodeQuery]);
  const trainOfferGroups = useMemo(
    () => (mode === "train" ? buildTrainOfferGroups(offers) : []),
    [mode, offers],
  );
  const recommendedOffer = mode === "train" ? null : offers[0];
  const moreOffers =
    mode === "train" || !recommendedOffer
      ? []
      : offers.filter((offer) => offer.id !== recommendedOffer.id);
  const recommendedTrainGroup = mode === "train" ? trainOfferGroups[0] : null;
  const moreTrainGroups = recommendedTrainGroup
    ? trainOfferGroups.filter(
        (group) => group.key !== recommendedTrainGroup.key,
      )
    : [];
  const moreOfferCount =
    mode === "train" ? moreTrainGroups.length : moreOffers.length;
  const moreOfferPageCount = Math.max(
    1,
    Math.ceil(moreOfferCount / TICKET_PAGE_SIZE),
  );
  const currentMoreOfferPage = Math.min(resultPage, moreOfferPageCount);
  const pagedMoreOffers =
    mode === "train"
      ? []
      : moreOffers.slice(
          (currentMoreOfferPage - 1) * TICKET_PAGE_SIZE,
          currentMoreOfferPage * TICKET_PAGE_SIZE,
        );
  const pagedMoreTrainGroups =
    mode === "train"
      ? moreTrainGroups.slice(
          (currentMoreOfferPage - 1) * TICKET_PAGE_SIZE,
          currentMoreOfferPage * TICKET_PAGE_SIZE,
        )
      : [];
  const pageStart =
    moreOfferCount === 0
      ? 0
      : (currentMoreOfferPage - 1) * TICKET_PAGE_SIZE + 1;
  const pageEnd = Math.min(
    currentMoreOfferPage * TICKET_PAGE_SIZE,
    moreOfferCount,
  );
  const availablePopularRoutes = popularRoutes[mode].filter(
    (route) => departures.includes(route.from) && arrivals.includes(route.to),
  );
  const suggestedArrivals = arrivals.filter((item) => item !== to).slice(0, 6);
  const selectedPassengerCount = selectedTravelers.length;
  const selectedTotalPrice = selectedOffer
    ? selectedOffer.price * selectedPassengerCount
    : 0;
  const travelerRuleError = validateTicketTravelerRules(selectedTravelers, {
    studentOnly,
    transportType: mode === "flight" ? "FLIGHT" : "TRAIN",
    departureDate: date,
  });
  const displayedResultCount =
    mode === "train" ? trainOfferGroups.length : offers.length;
  const allTrainTypesSelected =
    selectedTrainTypes.length === trainTypeFilters.length;

  const getDisplayedTrainOffer = (group: TrainOfferGroup) => {
    const manuallySelectedSeatId = trainSeatSelections[group.key];
    if (manuallySelectedSeatId) {
      const manuallySelectedSeat = group.offers.find(
        (offer) => offer.id === manuallySelectedSeatId,
      );
      if (manuallySelectedSeat) {
        return manuallySelectedSeat;
      }
    }
    if (selectedOffer) {
      const currentSelectedOffer = group.offers.find(
        (offer) => offer.id === selectedOffer.id,
      );
      if (currentSelectedOffer) {
        return currentSelectedOffer;
      }
    }
    return group.offers[0];
  };

  const clearAutoNavigate = () => {
    if (navigateTimerRef.current) {
      window.clearTimeout(navigateTimerRef.current);
      navigateTimerRef.current = null;
    }
  };

  const showToast = (message: string, errorToast = false) => {
    setToastError(errorToast);
    setToastMessage(message);
    setToastOpen(true);
  };

  const scrollToCheckoutSection = () => {
    (checkoutSummaryRef.current || checkoutSectionRef.current)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  useEffect(() => clearAutoNavigate, []);

  const searchTickets = async (
    departureCity = from,
    arrivalCity = to,
    departureDate = date,
  ) => {
    if (!departureCity || !arrivalCity) return;

    setLoading(true);
    setError(false);
    try {
      const response = await ApiRequests.searchTickets({
        type: mode === "flight" ? "FLIGHT" : "TRAIN",
        departureCity,
        arrivalCity,
        departureDate,
        minPrice: priceRange[0],
        maxPrice: priceRange[1],
        studentOnly,
        onlyAvailable,
        sortBy,
      });
      setTicketOffers(response.data);
      setResultPage(1);
      setSelectedOffer((current) =>
        current
          ? (response.data.find((offer) => offer.id === current.id) ?? null)
          : null,
      );
    } catch (e) {
      console.log(e);
      setTicketOffers([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setHasLoadedOptions(false);
    setSelectedTrainTypes(
      mode === "train" && preferredTrainTypeFilters.length > 0
        ? preferredTrainTypeFilters
        : defaultTrainTypeFilters,
    );
    setTrainCodeQuery(mode === "train" ? (rebookState.bookingCode ?? "") : "");
    setLoading(true);
    setError(false);
    ApiRequests.getTicketOptions(mode === "flight" ? "FLIGHT" : "TRAIN")
      .then((response) => {
        const nextDepartures = response.data.departures ?? [];
        const nextArrivals = response.data.arrivals ?? [];
        const nextFrom =
          (rebookState.routeFrom &&
          nextDepartures.includes(rebookState.routeFrom)
            ? rebookState.routeFrom
            : undefined) ??
          findPreferredCity(
            nextDepartures,
            bookingPreferences.defaultDepartureCity,
          ) ??
          findPreferredCity(nextDepartures, "北京") ??
          nextDepartures[0] ??
          "";
        const nextArrivalCandidates = nextArrivals.filter(
          (item) => item !== nextFrom,
        );
        const nextTo =
          (rebookState.routeTo &&
          nextArrivalCandidates.includes(rebookState.routeTo)
            ? rebookState.routeTo
            : undefined) ??
          findPreferredCity(
            nextArrivalCandidates,
            bookingPreferences.defaultArrivalCity,
          ) ??
          findPreferredCity(nextArrivalCandidates, "上海") ??
          nextArrivalCandidates[0] ??
          nextArrivals[0] ??
          "";
        setDepartures(nextDepartures);
        setArrivals(nextArrivals);
        setFrom(nextFrom);
        setTo(nextTo);
        return searchTickets(nextFrom, nextTo);
      })
      .catch((e) => {
        console.log(e);
        setError(true);
      })
      .finally(() => {
        setHasLoadedOptions(true);
        setLoading(false);
      });
  }, [mode]);

  useEffect(() => {
    if (!hasLoadedOptions || !from || !to) return;

    const timeoutId = window.setTimeout(() => {
      searchTickets().then((r) => r);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [priceRange, studentOnly, onlyAvailable, sortBy, date]);

  const swapLocations = () => {
    const oldFrom = from;
    setFrom(to);
    setTo(oldFrom);
  };

  const selectRoute = (departureCity: string, arrivalCity: string) => {
    setFrom(departureCity);
    setTo(arrivalCity);
    searchTickets(departureCity, arrivalCity).then((r) => r);
  };

  const toggleTrainType = (type: TrainTypeFilter) => {
    setSelectedTrainTypes((current) => {
      const nextTypes = current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type];
      setResultPage(1);
      return nextTypes;
    });
  };

  const toggleAllTrainTypes = () => {
    setSelectedTrainTypes(allTrainTypesSelected ? [] : defaultTrainTypeFilters);
    setResultPage(1);
  };

  const updateTrainCodeQuery = (value: string) => {
    setTrainCodeQuery(value);
    setResultPage(1);
  };

  const changeTrainSeat = (
    group: TrainOfferGroup,
    nextOffer: TicketSearchOffer,
  ) => {
    setTrainSeatSelections((current) => ({
      ...current,
      [group.key]: nextOffer.id,
    }));
    if (
      selectedOffer &&
      group.offers.some((offer) => offer.id === selectedOffer.id)
    ) {
      setSelectedOffer(nextOffer);
    }
    setBookingError(false);
    setBookingMessage("");
  };

  const updatePriceBound = (index: 0 | 1, value: string) => {
    const parsedValue = Number(value);
    if (Number.isNaN(parsedValue)) return;

    const nextRange = [...priceRange];
    nextRange[index] = Math.min(
      config.highPrice,
      Math.max(config.lowPrice, parsedValue),
    );

    if (index === 0 && nextRange[0] > nextRange[1]) {
      nextRange[1] = nextRange[0];
    }
    if (index === 1 && nextRange[1] < nextRange[0]) {
      nextRange[0] = nextRange[1];
    }

    setPriceRange(nextRange);
  };

  const selectTicket = (offer: TicketSearchOffer) => {
    if (!isAuthenticated) {
      setBookingError(true);
      setBookingMessage("请先登录账户，再选择班次并提交订单。");
      showToast("登录后才能选择和下单", true);
      return;
    }

    setSelectedOffer(offer);
    setBookingError(false);
    setBookingMessage("");
    scrollToCheckoutSection();
  };

  const openCheckoutConfirm = () => {
    if (!isAuthenticated) {
      setBookingError(true);
      setBookingMessage("请先登录账户，再选择班次并提交订单。");
      showToast("请先登录后再提交订单", true);
      return;
    }
    if (!selectedOffer) {
      setBookingError(true);
      setBookingMessage("请先选择一个可预订方案。");
      showToast("请先选择一个可预订方案", true);
      return;
    }
    if (selectedTravelers.length === 0) {
      setBookingError(true);
      setBookingMessage("请先选择或填写至少一位出行人。");
      showToast("请先选择或填写出行人", true);
      return;
    }
    if (travelerRuleError) {
      setBookingError(true);
      setBookingMessage(travelerRuleError);
      showToast(travelerRuleError, true);
      return;
    }
    if (
      selectedOffer.remainingSeats > 0 &&
      selectedTravelers.length > selectedOffer.remainingSeats
    ) {
      setBookingError(true);
      setBookingMessage("选择的出行人数超过当前余票数量。");
      showToast("出行人数超过当前余票数量", true);
      return;
    }

    setCheckoutConfirmOpen(true);
  };

  const reserveTicket = async () => {
    if (!isAuthenticated || !selectedOffer || selectedTravelers.length === 0) {
      setCheckoutConfirmOpen(false);
      return;
    }
    if (travelerRuleError) {
      setBookingError(true);
      setBookingMessage(travelerRuleError);
      showToast(travelerRuleError, true);
      return;
    }
    setBookingId(selectedOffer.id);
    setBookingError(false);
    setBookingMessage("");
    setCheckoutConfirmOpen(false);

    try {
      const response = await ApiRequests.createTicketReservation({
        userId: getCurrentUserId(),
        transportType: mode === "flight" ? "FLIGHT" : "TRAIN",
        routeFrom: from || "出发地",
        routeTo: to || "目的地",
        departureDate: date,
        departureTime: selectedOffer.departureTime,
        arrivalTime: selectedOffer.arrivalTime,
        provider: selectedOffer.carrier,
        bookingCode: selectedOffer.code,
        passengerCount: selectedTravelers.length,
        price: selectedOffer.price * selectedTravelers.length,
        travelers: selectedTravelers,
      });
      setReservationId(response.data.id);
      addNotification({
        type: "ORDER_CREATED",
        title: "订单已创建",
        message: `${mode === "flight" ? "机票" : "火车票"}订单 ${selectedOffer.code} 已创建，请在 30 分钟内完成支付。`,
        reservationId: response.data.id,
      });
      setBookingMessage(
        `已创建预订 ${response.data.id}，请在订单详情中完成支付。`,
      );
      showToast("订单提交成功，即将进入订单详情");
      clearAutoNavigate();
      navigateTimerRef.current = window.setTimeout(() => {
        navigate(`/reservations/${response.data.id}#payment-countdown`);
      }, 2000);
    } catch (e) {
      console.log(e);
      setBookingError(true);
      showToast("提交失败，请稍后再试", true);
    } finally {
      setBookingId("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-8 py-8">
      <Snackbar
        open={toastOpen}
        autoHideDuration={1800}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        sx={{ mt: 2, zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        <Alert
          severity={toastError ? "error" : "success"}
          onClose={() => setToastOpen(false)}
          action={
            !toastError && reservationId ? (
              <Button
                component={Link}
                to={`/reservations/${reservationId}#payment-countdown`}
                color="inherit"
                size="small"
                onClick={clearAutoNavigate}
              >
                查看订单
              </Button>
            ) : undefined
          }
          sx={{
            minWidth: 320,
            borderRadius: 2,
            boxShadow: 6,
            fontSize: 16,
            alignItems: "center",
          }}
        >
          {toastMessage}
        </Alert>
      </Snackbar>

      <div className="mb-6 rounded-lg bg-white border border-slate-200 px-7 py-6 shadow-sm">
        <Chip
          icon={config.icon}
          label={config.eyebrow}
          sx={{ backgroundColor: "#eff6ff", color: config.accent }}
        />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">
              {config.title}
            </h1>
            <p className="mt-2 text-slate-500">{config.hero}</p>
          </div>
          <div className="flex gap-2">
            <Chip
              icon={<ArrowForward />}
              label={`${from || "-"} 到 ${to || "-"}`}
            />
            <Chip
              icon={<Tune />}
              label={
                mode === "train"
                  ? `${displayedResultCount} 趟车次`
                  : `${displayedResultCount} 个方案`
              }
            />
            {mode === "train" && (
              <Chip
                label={
                  trainCodeQuery.trim()
                    ? `车次 ${trainCodeQuery.trim()}`
                    : allTrainTypesSelected
                      ? "全部车次"
                      : `${selectedTrainTypes.length} 类车次`
                }
              />
            )}
          </div>
        </div>
      </div>

      {error && (
        <Alert severity="warning" className="mb-4">
          后端票务数据暂时不可用，请确认交通服务已启动。
        </Alert>
      )}
      {!isAuthenticated && (
        <Alert severity="info" className="mb-4">
          未登录时可以查询票价和查看方案；登录后才能选择班次、填写出行人并提交订单。
        </Alert>
      )}
      {bookingError && (
        <Alert severity="error" className="mb-4">
          创建预订失败，请确认后端服务已启动。
        </Alert>
      )}
      {bookingMessage && (
        <Alert
          severity={bookingError ? "warning" : "success"}
          className="mb-4"
          action={
            reservationId ? (
              <Button
                component={Link}
                to={`/reservations/${reservationId}#payment-countdown`}
                color="inherit"
                size="small"
              >
                订单详情
              </Button>
            ) : undefined
          }
        >
          {bookingMessage}
        </Alert>
      )}

      <div className="grid grid-cols-[360px_1fr] gap-6 items-start">
        <aside className="sticky top-24 self-start flex max-h-[calc(100vh-7rem)] flex-col gap-5 overflow-y-auto pr-1">
          <section className="rounded-lg bg-white border border-slate-200 p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">查询行程</h2>
            <div className="grid grid-cols-[1fr_44px_1fr] items-center gap-2">
              <Autocomplete
                size="small"
                options={departures}
                value={from || null}
                noOptionsText="没有匹配城市"
                onChange={(_, value) => setFrom(value ?? "")}
                renderInput={(params) => (
                  <TextField {...params} label={config.fromLabel} />
                )}
              />
              <Button
                onClick={swapLocations}
                variant="outlined"
                sx={{ minWidth: 44, height: 40, borderRadius: 2 }}
              >
                <SwapHoriz />
              </Button>
              <Autocomplete
                size="small"
                options={arrivals}
                value={to || null}
                noOptionsText="没有匹配城市"
                onChange={(_, value) => setTo(value ?? "")}
                renderInput={(params) => (
                  <TextField {...params} label={config.toLabel} />
                )}
              />
            </div>
            {availablePopularRoutes.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold text-slate-500">
                  热门线路
                </p>
                <div className="flex flex-wrap gap-2">
                  {availablePopularRoutes.map((route) => (
                    <Chip
                      key={`${route.from}-${route.to}`}
                      size="small"
                      label={`${route.from} → ${route.to}`}
                      onClick={() => selectRoute(route.from, route.to)}
                      sx={{ cursor: "pointer", backgroundColor: "#f8fafc" }}
                    />
                  ))}
                </div>
              </div>
            )}
            <label className="block mt-5 text-sm font-semibold text-slate-700">
              出行日期
              <input
                className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <Button
              fullWidth
              variant="contained"
              size="large"
              startIcon={<Search />}
              sx={{ mt: 2, borderRadius: 2 }}
              onClick={() => searchTickets()}
              disabled={loading || !from || !to}
            >
              {loading ? "查询中" : "查询"}
            </Button>
          </section>

          <section className="rounded-lg bg-white border border-slate-200 p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">高级筛选</h2>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-700">学生票</span>
              <Switch
                checked={studentOnly}
                onChange={(event) => setStudentOnly(event.target.checked)}
              />
            </div>
            <div className="flex items-center justify-between mb-5">
              <span className="text-sm text-slate-700">只看有票</span>
              <Switch
                checked={onlyAvailable}
                onChange={(event) => setOnlyAvailable(event.target.checked)}
              />
            </div>
            {mode === "train" && (
              <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">
                    车次类型
                  </p>
                  <label className="flex cursor-pointer items-center gap-1 text-sm text-slate-700">
                    <Checkbox
                      size="small"
                      checked={allTrainTypesSelected}
                      indeterminate={
                        selectedTrainTypes.length > 0 && !allTrainTypesSelected
                      }
                      onChange={toggleAllTrainTypes}
                    />
                    全选
                  </label>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1">
                  {trainTypeFilters.map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-center gap-1 rounded-md px-1 py-1 text-sm text-slate-700 hover:bg-white"
                    >
                      <Checkbox
                        size="small"
                        checked={selectedTrainTypes.includes(option.value)}
                        onChange={() => toggleTrainType(option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                <TextField
                  fullWidth
                  size="small"
                  label="按车次筛选"
                  value={trainCodeQuery}
                  onChange={(event) =>
                    updateTrainCodeQuery(event.target.value.toUpperCase())
                  }
                  placeholder="例如 G101 / D / K"
                  sx={{ mt: 2, backgroundColor: "#fff" }}
                />
              </div>
            )}
            <p className="mb-2 text-sm font-semibold text-slate-700">
              价格区间
            </p>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                size="small"
                label="最低价"
                type="number"
                value={priceRange[0]}
                onChange={(event) => updatePriceBound(0, event.target.value)}
                inputProps={{ min: config.lowPrice, max: config.highPrice }}
              />
              <TextField
                size="small"
                label="最高价"
                type="number"
                value={priceRange[1]}
                onChange={(event) => updatePriceBound(1, event.target.value)}
                inputProps={{ min: config.lowPrice, max: config.highPrice }}
              />
            </div>
            <Slider
              value={priceRange}
              min={config.lowPrice}
              max={config.highPrice}
              onChange={(_, value) => setPriceRange(value as number[])}
            />
            <p className="text-sm text-slate-500 mb-5">
              ¥{priceRange[0]} - ¥{priceRange[1]}
            </p>
            <p className="mb-2 text-sm font-semibold text-slate-700">
              系统排序
            </p>
            <ToggleButtonGroup
              fullWidth
              color="primary"
              size="small"
              value={sortBy}
              exclusive
              onChange={(_, value) => value && setSortBy(value)}
            >
              <ToggleButton value="departure">出发时间</ToggleButton>
              <ToggleButton value="price">价格</ToggleButton>
            </ToggleButtonGroup>
            <Button
              fullWidth
              variant="outlined"
              sx={{ mt: 2, borderRadius: 2 }}
              onClick={() => searchTickets()}
              disabled={loading || !from || !to}
            >
              应用筛选
            </Button>
          </section>
        </aside>

        <main className="min-w-0">
          {loading && (
            <Box sx={{ height: 5 }} className="mb-4">
              <LinearProgress />
            </Box>
          )}
          <section className="rounded-lg bg-white border border-slate-200 p-5 shadow-sm overflow-x-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-950">
                {mode === "train" ? "推荐车次" : "推荐方案"}
              </h2>
              <span className="text-sm text-slate-500">{date}</span>
            </div>
            {mode === "train" && recommendedTrainGroup ? (
              <TrainTicketCard
                group={recommendedTrainGroup}
                displayedOffer={getDisplayedTrainOffer(recommendedTrainGroup)}
                onSeatChange={(offer) =>
                  changeTrainSeat(recommendedTrainGroup, offer)
                }
                onReserve={selectTicket}
                reserving={
                  bookingId === getDisplayedTrainOffer(recommendedTrainGroup).id
                }
                canReserve={
                  isAuthenticated &&
                  getDisplayedTrainOffer(recommendedTrainGroup).remainingSeats >
                    0
                }
                disabledLabel={!isAuthenticated ? "登录后选择" : "暂无余票"}
                selected={
                  selectedOffer?.id ===
                  getDisplayedTrainOffer(recommendedTrainGroup).id
                }
              />
            ) : recommendedOffer ? (
              <TicketCard
                offer={recommendedOffer}
                mode={mode}
                onReserve={selectTicket}
                reserving={bookingId === recommendedOffer.id}
                canReserve={
                  isAuthenticated && recommendedOffer.remainingSeats > 0
                }
                disabledLabel={!isAuthenticated ? "登录后选择" : "暂无余票"}
                selected={selectedOffer?.id === recommendedOffer.id}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-slate-500">
                <p>暂无匹配班次，请调整出发地或目的地</p>
                {suggestedArrivals.length > 0 && (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {suggestedArrivals.map((item) => (
                      <Chip
                        key={item}
                        size="small"
                        label={`试试 ${from || "当前城市"} → ${item}`}
                        onClick={() => selectRoute(from, item)}
                        sx={{ cursor: "pointer" }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="mt-5 rounded-lg bg-white border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-slate-950">
                {mode === "train" ? "更多车次" : "更多可选方案"}
              </h2>
              <p className="text-sm text-slate-500">
                {moreOfferCount > 0
                  ? `显示 ${pageStart}-${pageEnd} / 共 ${moreOfferCount} 条`
                  : "暂无更多方案"}
              </p>
            </div>
            <div className="mt-4 rounded-lg bg-slate-50 p-3 pr-2">
              <div className="flex flex-col gap-3">
                {mode === "train" &&
                  pagedMoreTrainGroups.map((group) => (
                    <TrainTicketCard
                      key={group.key}
                      group={group}
                      displayedOffer={getDisplayedTrainOffer(group)}
                      onSeatChange={(offer) => changeTrainSeat(group, offer)}
                      onReserve={selectTicket}
                      reserving={bookingId === getDisplayedTrainOffer(group).id}
                      canReserve={
                        isAuthenticated &&
                        getDisplayedTrainOffer(group).remainingSeats > 0
                      }
                      disabledLabel={
                        !isAuthenticated ? "登录后选择" : "暂无余票"
                      }
                      selected={
                        selectedOffer?.id === getDisplayedTrainOffer(group).id
                      }
                    />
                  ))}
                {mode !== "train" &&
                  pagedMoreOffers.map((offer) => (
                    <TicketCard
                      key={offer.id}
                      offer={offer}
                      mode={mode}
                      compact
                      onReserve={selectTicket}
                      reserving={bookingId === offer.id}
                      canReserve={isAuthenticated && offer.remainingSeats > 0}
                      disabledLabel={
                        !isAuthenticated ? "登录后选择" : "暂无余票"
                      }
                      selected={selectedOffer?.id === offer.id}
                    />
                  ))}
                {moreOfferCount === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center text-slate-500">
                    暂无更多可选方案
                  </div>
                )}
              </div>
            </div>
            {moreOfferCount > TICKET_PAGE_SIZE && (
              <div className="mt-4 flex justify-center">
                <Pagination
                  count={moreOfferPageCount}
                  page={currentMoreOfferPage}
                  color="primary"
                  onChange={(_, page) => setResultPage(page)}
                />
              </div>
            )}
          </section>

          <section
            ref={checkoutSectionRef}
            className="mt-5 rounded-lg bg-white border border-slate-200 p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-950">填写订单</h2>
                <p className="mt-1 text-sm text-slate-500">
                  确认车次或航班后，请在这里填写出行人并提交订单。
                </p>
              </div>
              {selectedOffer && (
                <Chip
                  color="primary"
                  variant="outlined"
                  label={`${selectedOffer.carrier} ${selectedOffer.code}`}
                />
              )}
            </div>
            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-4">
                {selectedOffer ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-semibold text-slate-900">
                          {selectedOffer.carrier} {selectedOffer.code}
                        </p>
                        <p className="mt-2 text-sm text-slate-600">
                          {from} → {to} · {date}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {formatTicketTimeRange(selectedOffer)} ·{" "}
                          {selectedOffer.duration}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-500">
                          {mode === "flight" ? "舱位" : "席别"}
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-900">
                          {selectedOffer.seatClass}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          余票 {selectedOffer.remainingSeats}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    请选择要预订的车次或航班。
                  </div>
                )}
                <TravelerSelector
                  title={mode === "flight" ? "选择乘机人" : "选择乘车人"}
                  onChange={setSelectedTravelers}
                />
              </div>
              <section
                ref={checkoutSummaryRef}
                className="rounded-lg border border-slate-200 bg-slate-50 p-4 lg:sticky lg:top-24 lg:self-start"
              >
                <h3 className="text-lg font-bold text-slate-900">订单信息</h3>
                {selectedOffer ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>出行人</span>
                      <span>{selectedPassengerCount} 人</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>单价</span>
                      <span>¥{selectedOffer.price}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                      <span className="font-semibold text-slate-900">
                        应付金额
                      </span>
                      <span className="text-2xl font-bold text-orange-500">
                        ¥{selectedTotalPrice}
                      </span>
                    </div>
                    <Button
                      fullWidth
                      variant="contained"
                      size="large"
                      sx={{ borderRadius: 2 }}
                      disabled={
                        !isAuthenticated ||
                        bookingId === selectedOffer.id ||
                        selectedPassengerCount === 0 ||
                        Boolean(travelerRuleError)
                      }
                      onClick={openCheckoutConfirm}
                    >
                      {!isAuthenticated
                        ? "登录后提交"
                        : bookingId === selectedOffer.id
                          ? "提交中"
                          : "提交订单"}
                    </Button>
                    {!isAuthenticated && (
                      <p className="text-xs text-orange-500">
                        请先登录账户，才能选择出行人并提交订单。
                      </p>
                    )}
                    {selectedPassengerCount === 0 && (
                      <p className="text-xs text-orange-500">
                        请先选择或填写出行人。
                      </p>
                    )}
                    {travelerRuleError && (
                      <p className="text-xs text-red-500">
                        {travelerRuleError}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                    选择方案后显示订单金额与提交入口。
                  </div>
                )}
              </section>
            </div>
          </section>

          <section className="mt-5 rounded-lg bg-white border border-slate-200 p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">比价提示</h2>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="font-semibold text-blue-700">价格实时性</p>
                <p className="mt-2 text-sm text-slate-600">
                  当前展示价格基于最近可售数据整理，最终金额以订单确认信息为准。
                </p>
              </div>
              <div className="rounded-lg bg-orange-50 p-4">
                <p className="font-semibold text-orange-700">优惠获取</p>
                <p className="mt-2 text-sm text-slate-600">
                  铁路线路支持学生票筛选，后续可继续接入会员价与平台优惠。
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-4">
                <p className="font-semibold text-emerald-700">后续扩展</p>
                <p className="mt-2 text-sm text-slate-600">
                  每条票务记录来自后端数据库，来源链接可在价格下方打开核对。
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
      {selectedOffer && (
        <CheckoutConfirmDialog
          open={checkoutConfirmOpen}
          title={mode === "flight" ? "确认机票订单" : "确认火车票订单"}
          subtitle="提交后将生成待支付订单，支付倒计时为 30 分钟。"
          travelers={selectedTravelers}
          summaryRows={[
            { label: "线路", value: `${from} → ${to}` },
            { label: "日期", value: date },
            {
              label: "班次",
              value: `${selectedOffer.carrier} ${selectedOffer.code}`,
            },
            {
              label: "时间",
              value: formatTicketTimeRange(selectedOffer),
            },
            { label: "席别", value: selectedOffer.seatClass },
          ]}
          priceRows={[
            {
              label: "票价",
              value: `¥${selectedOffer.price} × ${selectedPassengerCount} 人`,
            },
            { label: "服务费", value: "¥0.00" },
          ]}
          totalPrice={selectedTotalPrice}
          rules={[
            "未支付订单将在 30 分钟后自动超时。",
            "支付成功后如需取消，可在订单详情页申请退款。",
            "退改签规则以承运方实时政策为准，最终出票信息以订单详情为准。",
          ]}
          submitting={bookingId === selectedOffer.id}
          onClose={() => setCheckoutConfirmOpen(false)}
          onConfirm={reserveTicket}
        />
      )}
    </div>
  );
};

export default TicketBooking;
