import React, {useEffect, useMemo, useRef, useState} from "react";
import {Link, useLocation, useNavigate, useParams} from "react-router-dom";
import Countdown, {CountdownRenderProps} from "react-countdown";
import {
    Alert,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    InputAdornment,
    LinearProgress,
    MenuItem,
    Paper,
    Radio,
    RadioGroup,
    TextField
} from "@mui/material";
import {
    ArrowBack,
    Cancel,
    CheckCircle,
    CreditCard,
    Event,
    Flight as FlightIcon,
    Hotel as HotelIcon,
    Person,
    ReceiptLong,
    Refresh,
    Route,
    Train as TrainIcon
} from "@mui/icons-material";
import {
    ApiRequests,
    PaymentTransactionResponse,
    RefundRecordResponse,
    ReservationResponse
} from "../../core/apiConfig";
import WalletTopUpDialog, {WalletTopUpDialogPayload} from "../../account/components/WalletTopUpDialog";
import {
    ACCOUNT_IDENTITY_EVENT,
    AccountIdentity,
    addNotification,
    BANK_CARDS_EVENT,
    getAccountIdentity,
    getCurrentUserSession,
    getPaymentPreferences,
    getSavedBankCards,
    getWalletState,
    PAYMENT_PREFERENCES_EVENT,
    PaymentMethodPreference,
    rechargeWallet,
    refundWallet,
    SavedBankCard,
    setAccountIdentity,
    setPaymentPreferences,
    spendWallet,
    WALLET_EVENT,
    WalletState
} from "../../core/currentUser";
import {
    canCancelReservation,
    canPayReservation,
    formatSystemDate,
    formatTripDate,
    getEffectiveReservationStatus,
    getPaymentDeadlineMillis,
    getReservationStatusMeta
} from "../orderStatus";
import {useAuthSession} from "../../core/useAuthSession";
import {
    getBankCardIssuerInfo,
    getChineseResidentIdInfo,
    normalizeDigits,
    normalizeDocumentNumber,
    validateBankCard,
    validateDocumentNumber
} from "../../core/validation";

const bookingTypeMeta: Record<string, {label: string; icon: JSX.Element}> = {
    PACKAGE: {label: "旅游套餐", icon: <Route/>},
    FLIGHT: {label: "机票订单", icon: <FlightIcon/>},
    TRAIN: {label: "火车票订单", icon: <TrainIcon/>},
    HOTEL: {label: "酒店订单", icon: <HotelIcon/>},
};

const formatCurrency = (value: number) => `¥${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

const parsePositiveAmount = (value: string | number) => {
    const amount = typeof value === "number" ? value : Number(value);
    return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

const formatCountdownNumber = (value: number) => value.toString().padStart(2, "0");

const renderPaymentCountdown = ({days, hours, minutes, seconds, completed}: CountdownRenderProps) => {
    if (completed) return <span className="text-lg font-bold text-red-600">已超时</span>;

    const totalHours = days * 24 + hours;
    return (
        <span className="font-mono text-2xl font-bold text-amber-700">
            {formatCountdownNumber(totalHours)}:{formatCountdownNumber(minutes)}:{formatCountdownNumber(seconds)}
        </span>
    );
};

const TimelineItem = ({
    active,
    title,
    time,
    description,
    last = false
}: {
    active: boolean;
    title: string;
    time?: string | null;
    description?: string;
    last?: boolean;
}) => (
    <div className="grid grid-cols-[28px_1fr] gap-3">
        <div className="flex flex-col items-center">
            <CheckCircle className={active ? "text-emerald-600" : "text-slate-300"} fontSize="small"/>
            {!last && <div className={`mt-1 h-full min-h-8 w-px ${active ? "bg-emerald-200" : "bg-slate-200"}`}/>}
        </div>
        <div className="pb-4">
            <p className={active ? "text-sm font-semibold text-slate-900" : "text-sm text-slate-400"}>{title}</p>
            <p className="mt-1 text-xs text-slate-400">{formatSystemDate(time)}</p>
            {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
    </div>
);

const documentTypeOptions = ["身份证", "护照", "港澳通行证", "台胞证", "其他"];
const WALLET_PAYMENT_CARD_NUMBER = "6222020000078888";

const walletTransactionMeta = {
    TOP_UP: {label: "充值", color: "success" as const},
    PAYMENT: {label: "支付", color: "warning" as const},
    REFUND: {label: "退款", color: "info" as const},
};

const validatePayerIdentity = (identity: AccountIdentity) => {
    if (!identity.realName.trim()) {
        return "请填写付款人真实姓名。";
    }
    return validateDocumentNumber(identity.documentType, identity.documentNumber, true);
};

export default function ReservationDetails() {
    const {reservationId = ""} = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const session = useAuthSession();
    const isAuthenticated = Boolean(session);
    const summarySectionRef = useRef<HTMLElement | null>(null);
    const paymentCountdownRef = useRef<HTMLDivElement | null>(null);
    const [reservation, setReservation] = useState<ReservationResponse>();
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [payDialogOpen, setPayDialogOpen] = useState(false);
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
    const [cardNumber, setCardNumber] = useState("6222020000000056");
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethodPreference>(() => getPaymentPreferences().defaultPaymentMethod);
    const [payerIdentity, setPayerIdentity] = useState<AccountIdentity>(() => getAccountIdentity());
    const [wallet, setWallet] = useState<WalletState>(() => getWalletState());
    const [savedBankCards, setSavedBankCards] = useState<SavedBankCard[]>(() => getSavedBankCards());
    const [topUpAmount, setTopUpAmount] = useState("500");
    const [topUpDialogOpen, setTopUpDialogOpen] = useState(false);
    const [cancellationReason, setCancellationReason] = useState("");
    const [payments, setPayments] = useState<PaymentTransactionResponse[]>([]);
    const [refunds, setRefunds] = useState<RefundRecordResponse[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const paymentDeadline = useMemo(() => getPaymentDeadlineMillis(reservation), [reservation?.createdAt, reservation?.paymentDeadline]);

    const refundWalletIfReservationAlreadyRefunded = (loadedReservation: ReservationResponse, loadedRefunds: RefundRecordResponse[]) => {
        const completedRefundRecord = loadedRefunds.find(refund => refund.status === "COMPLETED");
        const refundStarted = Boolean(loadedReservation.refundRequestedAt || loadedReservation.refundedAt || loadedRefunds.length > 0);
        if (loadedReservation.status !== "REFUNDED" && !completedRefundRecord && !refundStarted) {
            return false;
        }

        const currentWallet = getWalletState();
        const walletPaidReservation = currentWallet.transactions.some(transaction =>
            transaction.type === "PAYMENT" && transaction.reservationId === loadedReservation.id
        );
        const alreadyRefunded = currentWallet.transactions.some(transaction =>
            transaction.type === "REFUND" && transaction.reservationId === loadedReservation.id
        );

        if (!walletPaidReservation || alreadyRefunded) {
            setWallet(currentWallet);
            return false;
        }

        const nextWallet = refundWallet(
            Math.round(Number(loadedReservation.price || 0) * 100) / 100,
            `订单退款 ${loadedReservation.title || loadedReservation.id}`,
            loadedReservation.id
        );
        setWallet(nextWallet);
        return true;
    };

    const loadReservation = async () => {
        setLoading(true);
        setErrorMessage("");
        try {
            if (!session) throw new Error("Authentication required");
            const [reservationResponse, paymentsResponse, refundsResponse] = await Promise.all([
                ApiRequests.getReservation(session.token, reservationId),
                ApiRequests.getReservationPayments(session.token, reservationId),
                ApiRequests.getReservationRefunds(session.token, reservationId)
            ]);
            const loadedReservation = reservationResponse.data;
            const loadedRefunds = refundsResponse.data;
            const walletRefunded = refundWalletIfReservationAlreadyRefunded(loadedReservation, loadedRefunds);
            setReservation(loadedReservation);
            setPayments(paymentsResponse.data);
            setRefunds(loadedRefunds);
            if (walletRefunded) {
                addNotification({
                    type: "REFUND_COMPLETED",
                    title: "退款已到账",
                    message: `订单 ${loadedReservation.title || loadedReservation.id} 的退款已退回钱包。`,
                    reservationId: loadedReservation.id,
                });
                setSuccessMessage("退款已完成，金额已退回钱包。");
            }
        } catch {
            setErrorMessage("订单读取失败，请检查订单是否存在。");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReservation().then(r => r);
    }, [reservationId, session?.token]);

    useEffect(() => {
        const refreshPaymentAssets = () => {
            setPayerIdentity(getAccountIdentity());
            setWallet(getWalletState());
            setSavedBankCards(getSavedBankCards());
            setPaymentMethod(getPaymentPreferences().defaultPaymentMethod);
        };
        refreshPaymentAssets();
        window.addEventListener(ACCOUNT_IDENTITY_EVENT, refreshPaymentAssets);
        window.addEventListener(BANK_CARDS_EVENT, refreshPaymentAssets);
        window.addEventListener(WALLET_EVENT, refreshPaymentAssets);
        window.addEventListener(PAYMENT_PREFERENCES_EVENT, refreshPaymentAssets);

        return () => {
            window.removeEventListener(ACCOUNT_IDENTITY_EVENT, refreshPaymentAssets);
            window.removeEventListener(BANK_CARDS_EVENT, refreshPaymentAssets);
            window.removeEventListener(WALLET_EVENT, refreshPaymentAssets);
            window.removeEventListener(PAYMENT_PREFERENCES_EVENT, refreshPaymentAssets);
        };
    }, []);

    useEffect(() => {
        if (loading || !reservation) return;

        const timerId = window.setTimeout(() => {
            const shouldFocusPaymentCountdown = location.hash === "#payment-countdown" && canPayReservation(reservation, refunds);
            const target = shouldFocusPaymentCountdown ? paymentCountdownRef.current : summarySectionRef.current;
            target?.scrollIntoView({behavior: "auto", block: "start"});
        }, 0);

        return () => window.clearTimeout(timerId);
    }, [loading, location.hash, refunds, reservation]);

    if (loading && !reservation) {
        return <main className="min-h-screen bg-slate-50 px-8 py-10"><LinearProgress/></main>;
    }

    if (!reservation) {
        return (
            <main className="min-h-screen bg-slate-50 px-8 py-10">
                <Alert severity="error">{errorMessage}</Alert>
            </main>
        );
    }

    const completedRefund = refunds.find(refund => refund.status === "COMPLETED");
    const refundRequested = Boolean(reservation.refundRequestedAt || refunds.length > 0);
    const refundCompletedTime = reservation.refundedAt || completedRefund?.completedAt || reservation.refundRequestedAt;
    const effectiveStatus = getEffectiveReservationStatus(reservation, refunds);
    const status = getReservationStatusMeta(reservation, refunds);
    const canPay = canPayReservation(reservation, refunds);
    const canCancel = canCancelReservation(reservation, refunds);
    const cancellationTime = reservation.cancelledAt || reservation.refundRequestedAt || refundCompletedTime;
    const cancellationCompleted = Boolean(cancellationTime) || ["CANCELLED", "REFUND_PROCESSING", "REFUNDED"].includes(effectiveStatus);
    const typeMeta = bookingTypeMeta[reservation?.bookingType ?? ""] ?? {label: reservation?.bookingType ?? "订单", icon: <ReceiptLong/>};
    const approvedPayments = payments.filter(payment => payment.approved);
    const latestApprovedPayment = approvedPayments[0];
    const paidAmount = approvedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const refundAmount = refunds.filter(refund => refund.status === "COMPLETED").reduce((sum, refund) => sum + refund.amount, 0);
    const nextActionText = canPay
        ? "请先完成支付，支付后可在此页面继续申请取消或退款。"
        : effectiveStatus === "PAID"
            ? "订单已确认，如行程变化可在右侧申请退款。"
            : status.description;
    const timelineItems = [
        {active: true, title: "订单已创建", time: reservation.createdAt, description: "系统已保存本次预订信息。"},
        {active: Boolean(reservation.paidAt), title: "支付成功", time: reservation.paidAt, description: reservation.paidAt ? "支付流水已记录。" : "等待支付完成。"},
        {active: cancellationCompleted, title: "订单取消", time: cancellationTime, description: cancellationCompleted ? "取消或退款流程已启动。" : "未发生取消。"},
        {active: refundRequested, title: "退款申请", time: reservation.refundRequestedAt, description: refundRequested ? "退款申请已提交。" : "未提交退款。"},
        {active: Boolean(refundCompletedTime), title: "退款完成", time: refundCompletedTime, description: refundCompletedTime ? "退款已经完成。" : "等待退款结果。"},
    ];
    const reservationAmount = Math.round(Number(reservation.price || 0) * 100) / 100;
    const payerIdentityError = validatePayerIdentity(payerIdentity);
    const normalizedCardNumber = normalizeDigits(cardNumber);
    const bankCardError = paymentMethod === "CARD" ? validateBankCard(normalizedCardNumber) : "";
    const payerIdentityInfo = payerIdentity.documentType === "身份证" ? getChineseResidentIdInfo(payerIdentity.documentNumber) : null;
    const cardIssuerInfo = paymentMethod === "CARD" ? getBankCardIssuerInfo(normalizedCardNumber) : null;
    const hasValidPayerIdentity = !payerIdentityError;
    const walletCanPay = wallet.balance >= reservationAmount;
    const walletPaymentTransaction = wallet.transactions.find(transaction => transaction.type === "PAYMENT" && transaction.reservationId === reservation.id);
    const walletAlreadyRefunded = wallet.transactions.some(transaction => transaction.type === "REFUND" && transaction.reservationId === reservation.id);
    const walletBalanceGap = Math.max(0, Math.round((reservationAmount - wallet.balance) * 100) / 100);
    const isWalletPayment = Boolean(walletPaymentTransaction || latestApprovedPayment?.cardLast4 === "8888");
    const paymentMethodLabel = latestApprovedPayment
        ? isWalletPayment ? "钱包" : "银联卡"
        : "未支付";
    const refundDestination = effectiveStatus === "REFUNDED"
        ? isWalletPayment ? "退回钱包余额" : "原银联卡"
        : effectiveStatus === "PAID"
            ? isWalletPayment ? "退款将退回钱包余额" : "退款将退回原银联卡"
            : "无";
    const paymentDisabled = submitting
        || !isAuthenticated
        || !hasValidPayerIdentity
        || (paymentMethod === "CARD" && Boolean(bankCardError))
        || (paymentMethod === "WALLET" && !walletCanPay);

    const openPaymentDialog = () => {
        if (!isAuthenticated) {
            setErrorMessage("请先登录账户后再支付订单。");
            return;
        }

        setPayerIdentity(getAccountIdentity());
        setWallet(getWalletState());
        setPaymentMethod(getPaymentPreferences().defaultPaymentMethod);
        setPayDialogOpen(true);
    };

    const updatePaymentMethod = (method: PaymentMethodPreference) => {
        setPaymentMethod(method);
        setPaymentPreferences({defaultPaymentMethod: method});
    };

    const rechargeFromPaymentDialog = (amountValue?: number) => {
        if (!isAuthenticated) {
            setErrorMessage("请先登录账户后再充值。");
            return;
        }

        const amount = parsePositiveAmount(amountValue ?? topUpAmount);
        if (amount > 0) {
            setTopUpAmount(String(amount));
        }
        setTopUpDialogOpen(true);
        setErrorMessage("");
    };

    const confirmWalletTopUp = async (payload: WalletTopUpDialogPayload) => {
        if (!isAuthenticated) {
            throw new Error("请先登录账户后再充值。");
        }

        const nextWallet = rechargeWallet(payload.amount, {
            title: "银联卡快捷充值",
            channel: "BANK_CARD",
            accountLabel: payload.accountLabel,
            referenceNo: payload.referenceNo,
        });
        setWallet(nextWallet);
        setTopUpAmount(String(payload.amount));
        setSuccessMessage(`已通过${payload.accountLabel}充值 ${formatCurrency(payload.amount)}，当前余额 ${formatCurrency(nextWallet.balance)}。`);
        setErrorMessage("");
    };

    const refundWalletPaymentIfNeeded = () => {
        if (!walletPaymentTransaction || walletAlreadyRefunded) {
            return false;
        }

        const nextWallet = refundWallet(reservationAmount, `订单退款 ${reservation.title || reservation.id}`, reservation.id);
        setWallet(nextWallet);
        return true;
    };

    const submitPayment = async () => {
        if (!reservation) return;
        if (!isAuthenticated) {
            setErrorMessage("请先登录账户后再支付订单。");
            return;
        }

        const normalizedIdentity = {
            realName: payerIdentity.realName.trim(),
            documentType: payerIdentity.documentType.trim() || "身份证",
            documentNumber: normalizeDocumentNumber(payerIdentity.documentType, payerIdentity.documentNumber),
        };

        const payerError = validatePayerIdentity(normalizedIdentity);
        if (payerError) {
            setErrorMessage(payerError);
            return;
        }
        if (paymentMethod === "WALLET" && wallet.balance < reservationAmount) {
            setErrorMessage("钱包余额不足，请先充值或改用银联卡支付。");
            return;
        }
        const normalizedPaymentCardNumber = normalizeDigits(cardNumber);
        const cardError = paymentMethod === "CARD" ? validateBankCard(normalizedPaymentCardNumber) : "";
        if (cardError) {
            setErrorMessage(cardError);
            return;
        }

        setSubmitting(true);
        setErrorMessage("");
        setSuccessMessage("");
        try {
            const nextIdentity = setAccountIdentity(normalizedIdentity);
            setPayerIdentity(nextIdentity);
            const paymentCardNumber = paymentMethod === "WALLET" ? WALLET_PAYMENT_CARD_NUMBER : normalizedPaymentCardNumber;
            const session = getCurrentUserSession();
            if (!session) {
                setErrorMessage("请先登录后再支付");
                return;
            }
            await ApiRequests.payForReservation(session.token, {reservationId: reservation.id, cardNumber: paymentCardNumber});
            if (paymentMethod === "WALLET") {
                const nextWallet = spendWallet(reservationAmount, `支付订单 ${reservation.title || reservation.id}`, reservation.id);
                setWallet(nextWallet);
            }
            setPaymentPreferences({defaultPaymentMethod: paymentMethod});
            addNotification({
                type: "PAYMENT_SUCCESS",
                title: "支付成功",
                message: `${paymentMethod === "WALLET" ? "钱包" : "银联卡"}已支付 ${formatCurrency(reservationAmount)}。`,
                reservationId: reservation.id,
            });
            setPayDialogOpen(false);
            setSuccessMessage(paymentMethod === "WALLET" ? "钱包支付成功，订单状态已经更新。" : "银联卡支付成功，订单状态已经更新。");
            await loadReservation();
        } catch (error: any) {
            const responseData = error?.response?.data;
            const paymentError = typeof responseData === "string"
                ? responseData
                : responseData?.message || responseData?.error || error?.message;
            setErrorMessage(paymentError || "支付未通过。请检查银联卡号后重试。");
        } finally {
            setSubmitting(false);
        }
    };

    const submitCancellation = async () => {
        if (!reservation) return;
        setSubmitting(true);
        setErrorMessage("");
        setSuccessMessage("");
        try {
            if (!session) throw new Error("Authentication required");
            const response = await ApiRequests.cancelReservation(session.token, reservation.id, cancellationReason || "行程有变");
            const walletRefunded = effectiveStatus === "PAID" && refundWalletPaymentIfNeeded();
            setReservation(response.data);
            setCancelDialogOpen(false);
            if (effectiveStatus === "PAID") {
                addNotification({
                    type: "REFUND_COMPLETED",
                    title: "退款完成",
                    message: walletRefunded ? "退款已退回钱包余额。" : "退款已按原支付方式退回。",
                    reservationId: reservation.id,
                });
            }
            setSuccessMessage(
                effectiveStatus === "PAID"
                    ? walletRefunded
                        ? "退款已完成，金额已退回钱包。"
                        : "退款已完成，订单状态已更新。"
                    : "订单已取消。"
            );
            await loadReservation();
        } catch {
            setErrorMessage("取消申请失败，请稍后重试。");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="min-h-screen bg-slate-50 px-8 py-10">
            <div className="mx-auto max-w-6xl">
                <Button component={Link} to="/reservations" startIcon={<ArrowBack/>}>返回我的预订</Button>

                <section ref={summarySectionRef} className="mt-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                <Chip color={status.color} label={status.label}/>
                                <Chip variant="outlined" icon={typeMeta.icon} label={typeMeta.label}/>
                            </div>
                            <h1 className="text-3xl font-bold text-slate-950">{reservation.title || "旅行预订"}</h1>
                            <p className="mt-2 text-sm text-slate-500">订单号：{reservation.id}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-slate-500">订单金额</p>
                            <p className="mt-1 text-3xl font-bold text-orange-500">¥{Math.ceil(reservation.price).toLocaleString()}</p>
                        </div>
                    </div>
                    <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">{nextActionText}</p>
                    {!isAuthenticated && canPay &&
                        <Alert severity="info" className="mt-4">
                            未登录时可以查看订单和价格信息；登录后才能支付、充值或继续订单操作。
                        </Alert>
                    }

                    {canPay &&
                        <div ref={paymentCountdownRef} className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                            <div>
                                <p className="text-sm font-semibold text-amber-900">支付剩余时间</p>
                                <Countdown date={paymentDeadline} renderer={renderPaymentCountdown} onComplete={() => loadReservation().then(r => r)}/>
                            </div>
                            <Button variant="contained" startIcon={<CreditCard/>} disabled={!isAuthenticated} onClick={openPaymentDialog}>
                                {isAuthenticated ? "立即支付" : "登录后支付"}
                            </Button>
                        </div>
                    }
                </section>

                {errorMessage && <Alert severity="error" className="mt-4">{errorMessage}</Alert>}
                {successMessage && <Alert severity="success" className="mt-4">{successMessage}</Alert>}

                <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
                    <div className="grid gap-6">
                        <Paper elevation={0} className="border border-slate-200 p-6">
                            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Route/> 行程信息</h2>
                            <Divider className="my-4"/>
                            <div className="grid gap-5 sm:grid-cols-2">
                                <div><p className="text-sm text-slate-500">出发 / 入住</p><p className="mt-1 text-lg font-semibold text-slate-900">{formatTripDate(reservation.hotelTimeFrom)}</p></div>
                                <div><p className="text-sm text-slate-500">到达 / 离店</p><p className="mt-1 text-lg font-semibold text-slate-900">{formatTripDate(reservation.hotelTimeTo)}</p></div>
                                {reservation.provider &&<div><p className="text-sm text-slate-500">服务方 / 房型</p><p className="mt-1 text-lg font-semibold text-slate-900">{reservation.provider}</p></div>}
                                {reservation.bookingCode && <div><p className="text-sm text-slate-500">确认编号</p><p className="mt-1 text-lg font-semibold text-slate-900">{reservation.bookingCode}</p></div>}
                            </div>
                        </Paper>

                        <Paper elevation={0} className="border border-slate-200 p-6">
                            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Person/> 出行人 / 入住人</h2>
                            <Divider className="my-4"/>
                            <div className="grid gap-3">
                                {reservation.travelers.map((traveler, index) => (
                                    <div key={`${traveler.name}-${index}`} className="rounded-lg border border-slate-200 px-4 py-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="font-semibold text-slate-900">{traveler.name}</p>
                                            <Chip size="small" label={traveler.travelerType === "CHILD" ? "儿童" : traveler.travelerType === "STUDENT" ? "学生" : "成人"}/>
                                        </div>
                                        <p className="mt-2 text-xs text-slate-500">
                                            {traveler.documentType || "证件未填写"} {traveler.maskedDocumentNumber || ""}
                                            {traveler.maskedPhone ? ` · 手机 ${traveler.maskedPhone}` : ""}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </Paper>
                    </div>

                    <div className="grid h-fit gap-6">
                        <Paper elevation={0} className="border border-slate-200 p-6">
                            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Event/> 状态时间线</h2>
                            <div className="mt-5 grid gap-5">
                                {timelineItems.map((item, index) => (
                                    <TimelineItem
                                        key={item.title}
                                        active={item.active}
                                        title={item.title}
                                        time={item.time}
                                        description={item.description}
                                        last={index === timelineItems.length - 1}
                                    />
                                ))}
                            </div>
                        </Paper>

                        <Paper elevation={0} className="border border-slate-200 p-6">
                            <h2 className="text-lg font-bold text-slate-900">支付信息</h2>
                            <div className="mt-4 grid gap-3 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-500">支付方式</span>
                                    <span className="font-semibold text-slate-900">{paymentMethodLabel}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-500">支付金额</span>
                                    <span className="font-semibold text-slate-900">{formatCurrency(paidAmount || reservationAmount)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-500">已退金额</span>
                                    <span className="font-semibold text-emerald-600">{formatCurrency(refundAmount)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-500">退款到账方式</span>
                                    <span className="font-semibold text-slate-900">{refundDestination}</span>
                                </div>
                            </div>
                        </Paper>

                        <Paper elevation={0} className="border border-slate-200 p-6">
                            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><ReceiptLong/> 订单操作</h2>
                            <div className="mt-4 grid gap-3">
                                <Button variant="outlined" startIcon={<Refresh/>} onClick={loadReservation}>刷新状态</Button>
                                {canCancel && <Button color="error" variant="outlined" startIcon={<Cancel/>} onClick={() => setCancelDialogOpen(true)}>
                                    {effectiveStatus === "PAID" ? "申请退款" : "取消订单"}
                                </Button>}
                            </div>
                            {reservation.cancellationReason && <p className="mt-4 text-xs text-slate-500">取消原因：{reservation.cancellationReason}</p>}
                        </Paper>

                        <Paper elevation={0} className="border border-slate-200 p-6">
                            <h2 className="text-lg font-bold text-slate-900">支付流水</h2>
                            <div className="mt-4 grid gap-3">
                                {payments.map(payment => (
                                    <div key={payment.id} className="rounded-lg border border-slate-200 px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <Chip size="small" color={payment.approved ? "success" : "error"} label={payment.approved ? "支付成功" : "支付失败"}/>
                                            <span className="text-sm font-semibold">¥{Math.ceil(payment.amount).toLocaleString()}</span>
                                        </div>
                                        <p className="mt-2 text-xs text-slate-500">
                                            {formatSystemDate(payment.createdAt)} · 尾号 {payment.cardLast4 || "----"}
                                        </p>
                                        {payment.failureReason && <p className="mt-1 text-xs text-red-500">{payment.failureReason}</p>}
                                    </div>
                                ))}
                                {payments.length === 0 && <p className="text-sm text-slate-500">暂无支付记录</p>}
                            </div>
                        </Paper>

                        <Paper elevation={0} className="border border-slate-200 p-6">
                            <h2 className="text-lg font-bold text-slate-900">退款记录</h2>
                            <div className="mt-4 grid gap-3">
                                {refunds.map(refund => (
                                    <div key={refund.id} className="rounded-lg border border-slate-200 px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <Chip size="small" color={refund.status === "COMPLETED" ? "success" : "info"} label={refund.status === "COMPLETED" ? "已退款" : "处理中"}/>
                                            <span className="text-sm font-semibold">¥{Math.ceil(refund.amount).toLocaleString()}</span>
                                        </div>
                                        <p className="mt-2 text-xs text-slate-500">申请：{formatSystemDate(refund.requestedAt)}</p>
                                        {refund.completedAt && <p className="mt-1 text-xs text-slate-500">完成：{formatSystemDate(refund.completedAt)}</p>}
                                        {refund.reason && <p className="mt-1 text-xs text-slate-500">原因：{refund.reason}</p>}
                                    </div>
                                ))}
                                {refunds.length === 0 && <p className="text-sm text-slate-500">暂无退款记录</p>}
                            </div>
                        </Paper>
                    </div>
                </div>
            </div>

            <Dialog open={payDialogOpen} onClose={() => setPayDialogOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>支付订单</DialogTitle>
                <DialogContent>
                    <Alert severity="info" className="mb-4">
                        可使用钱包余额或银联卡完成支付，支付成功后订单状态会立即更新。
                    </Alert>

                    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm text-slate-500">本次应付</p>
                                <p className="mt-1 text-2xl font-bold text-orange-500">{formatCurrency(reservationAmount)}</p>
                            </div>
                            <Chip color={hasValidPayerIdentity ? "success" : "warning"} label={hasValidPayerIdentity ? "实名信息完整" : "需实名信息"}/>
                        </div>
                    </div>

                    <div className="grid gap-4">
                        <div className="rounded-lg border border-slate-200 p-4">
                            <p className="mb-3 font-semibold text-slate-900">付款人实名信息</p>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <TextField
                                    label="真实姓名"
                                    value={payerIdentity.realName}
                                    onChange={event => setPayerIdentity({...payerIdentity, realName: event.target.value})}
                                    fullWidth
                                />
                                <TextField
                                    select
                                    label="证件类型"
                                    value={payerIdentity.documentType}
                                    onChange={event => setPayerIdentity({...payerIdentity, documentType: event.target.value})}
                                    fullWidth
                                >
                                    {documentTypeOptions.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
                                </TextField>
                                <TextField
                                    className="sm:col-span-2"
                                    label="证件号码"
                                    value={payerIdentity.documentNumber}
                                    onChange={event => setPayerIdentity({...payerIdentity, documentNumber: event.target.value.trim()})}
                                    error={Boolean(payerIdentity.documentNumber && payerIdentityError)}
                                    helperText={payerIdentity.documentNumber
                                        ? payerIdentityError || `${payerIdentityInfo ? `已识别生日 ${payerIdentityInfo.birthDate} · ${payerIdentityInfo.age} 岁，` : ""}支付成功后会保存为账号实名信息，后续自动带入。`
                                        : "支付成功后会保存为账号实名信息，后续自动带入。"}
                                    fullWidth
                                />
                            </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 p-4">
                            <p className="mb-2 font-semibold text-slate-900">选择支付方式</p>
                            <RadioGroup
                                value={paymentMethod}
                                onChange={event => updatePaymentMethod(event.target.value as PaymentMethodPreference)}
                            >
                                <FormControlLabel
                                    value="WALLET"
                                    control={<Radio/>}
                                    label={`钱包余额支付（余额 ${formatCurrency(wallet.balance)}）`}
                                />
                                <FormControlLabel
                                    value="CARD"
                                    control={<Radio/>}
                                    label="银联卡支付"
                                />
                            </RadioGroup>

                            {paymentMethod === "WALLET" &&
                                <div className="mt-3 rounded-lg bg-orange-50 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-sm text-orange-700">
                                            {walletCanPay ? "余额充足，可直接支付。" : `还差 ${formatCurrency(Math.max(0, reservationAmount - wallet.balance))}。`}
                                        </span>
                                        <div className="flex flex-wrap gap-2">
                                            {!walletCanPay && walletBalanceGap > 0 &&
                                                <Button size="small" variant="contained" onClick={() => rechargeFromPaymentDialog(walletBalanceGap)}>
                                                    补差额 {formatCurrency(walletBalanceGap)}
                                                </Button>
                                            }
                                            {[100, 500, 1000].map(amount => (
                                                <Button key={amount} size="small" variant="outlined" onClick={() => rechargeFromPaymentDialog(amount)}>
                                                    充 {formatCurrency(amount)}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="mt-3 flex gap-2">
                                        <TextField
                                            size="small"
                                            label="自定义充值"
                                            type="number"
                                            value={topUpAmount}
                                            onChange={event => setTopUpAmount(event.target.value)}
                                            inputProps={{min: 1, step: 1}}
                                            InputProps={{
                                                startAdornment: <InputAdornment position="start">¥</InputAdornment>
                                            }}
                                        />
                                        <Button variant="contained" onClick={() => rechargeFromPaymentDialog()}>去充值</Button>
                                    </div>
                                    <p className="mt-2 text-xs text-orange-700">充值前请先绑定银联卡，充值时可直接选择已保存的银联卡。</p>
                                    {wallet.transactions.length > 0 &&
                                        <div className="mt-3 grid gap-2">
                                            {wallet.transactions.slice(0, 3).map(transaction => {
                                                const meta = walletTransactionMeta[transaction.type];
                                                return (
                                                    <div key={transaction.id} className="rounded bg-white px-3 py-2 text-xs">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="truncate text-slate-500">{meta.label} · {transaction.title}</span>
                                                            <span className={transaction.type === "PAYMENT" ? "font-semibold text-red-500" : "font-semibold text-emerald-600"}>
                                                                {transaction.type === "PAYMENT" ? "-" : "+"}{formatCurrency(transaction.amount)}
                                                            </span>
                                                        </div>
                                                        {transaction.accountLabel &&
                                                            <p className="mt-1 truncate text-slate-400">
                                                                {transaction.accountLabel}{transaction.referenceNo ? ` · 流水号 ${transaction.referenceNo}` : ""}
                                                            </p>
                                                        }
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    }
                                </div>
                            }

                            {paymentMethod === "CARD" &&
                                <div className="mt-3">
                                    <TextField
                                        fullWidth
                                        label="银联卡号"
                                        value={cardNumber}
                                        onChange={event => setCardNumber(normalizeDigits(event.target.value).slice(0, 19))}
                                        error={Boolean(cardNumber && bankCardError)}
                                        helperText={cardNumber
                                            ? bankCardError || `${cardIssuerInfo ? `已识别 ${cardIssuerInfo.displayName}；` : ""}仅支持 16-19 位银联卡号。`
                                            : "仅支持 16-19 位银联卡号。"}
                                    />
                                </div>
                            }
                        </div>
                    </div>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPayDialogOpen(false)}>稍后支付</Button>
                    <Button variant="contained" disabled={paymentDisabled} onClick={submitPayment}>
                        {submitting ? "支付中..." : "确认支付"}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={cancelDialogOpen} onClose={() => setCancelDialogOpen(false)} fullWidth maxWidth="xs">
                <DialogTitle>{effectiveStatus === "PAID" ? "申请退款" : "取消订单"}</DialogTitle>
                <DialogContent>
                    <TextField
                        className="mt-2"
                        fullWidth
                        multiline
                        minRows={3}
                        label="原因"
                        value={cancellationReason}
                        onChange={event => setCancellationReason(event.target.value)}
                        placeholder="例如：行程有变"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCancelDialogOpen(false)}>返回</Button>
                    <Button color="error" variant="contained" disabled={submitting} onClick={submitCancellation}>确认提交</Button>
                </DialogActions>
            </Dialog>

            <WalletTopUpDialog
                open={topUpDialogOpen}
                defaultAmount={topUpAmount}
                savedCards={savedBankCards}
                onClose={() => setTopUpDialogOpen(false)}
                onConfirm={confirmWalletTopUp}
                onAddCard={() => navigate("/account")}
            />
        </main>
    );
}
