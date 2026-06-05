import React, {useEffect, useMemo, useState} from "react";
import {Link, useParams} from "react-router-dom";
import Countdown from "react-countdown";
import {
    Alert,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    LinearProgress,
    Paper,
    TextField
} from "@mui/material";
import {
    ArrowBack,
    Cancel,
    CheckCircle,
    CreditCard,
    Event,
    Person,
    ReceiptLong,
    Refresh,
    Route
} from "@mui/icons-material";
import {
    ApiRequests,
    PaymentTransactionResponse,
    RefundRecordResponse,
    ReservationResponse,
    ReservationStatus
} from "../../core/apiConfig";

const statusMeta: Record<ReservationStatus, {label: string; color: "default" | "success" | "warning" | "error" | "info"; description: string}> = {
    PENDING_PAYMENT: {label: "待支付", color: "warning", description: "订单已创建，请在倒计时结束前完成支付。"},
    PAID: {label: "已支付", color: "success", description: "支付成功，出行信息已经确认。"},
    CANCELLED: {label: "已取消", color: "default", description: "订单已取消，无需继续支付。"},
    EXPIRED: {label: "已过期", color: "error", description: "订单超过支付时间，请重新预订。"},
    REFUND_PROCESSING: {label: "退款处理中", color: "info", description: "退款申请已提交，平台正在处理。"},
    REFUNDED: {label: "已退款", color: "success", description: "退款已经完成。"},
};

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString() : "-";

const TimelineItem = ({active, title, time}: {active: boolean; title: string; time?: string | null}) => (
    <div className="flex gap-3">
        <CheckCircle className={active ? "text-emerald-600" : "text-slate-300"} fontSize="small"/>
        <div>
            <p className={active ? "text-sm font-semibold text-slate-800" : "text-sm text-slate-400"}>{title}</p>
            <p className="mt-1 text-xs text-slate-400">{formatDate(time)}</p>
        </div>
    </div>
);

export default function ReservationDetails() {
    const {reservationId = ""} = useParams();
    const [reservation, setReservation] = useState<ReservationResponse>();
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [payDialogOpen, setPayDialogOpen] = useState(false);
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
    const [cardNumber, setCardNumber] = useState("1234567812345674");
    const [cancellationReason, setCancellationReason] = useState("");
    const [payments, setPayments] = useState<PaymentTransactionResponse[]>([]);
    const [refunds, setRefunds] = useState<RefundRecordResponse[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const loadReservation = async () => {
        setLoading(true);
        setErrorMessage("");
        try {
            const [reservationResponse, paymentsResponse, refundsResponse] = await Promise.all([
                ApiRequests.getReservation(reservationId),
                ApiRequests.getReservationPayments(reservationId),
                ApiRequests.getReservationRefunds(reservationId)
            ]);
            setReservation(reservationResponse.data);
            setPayments(paymentsResponse.data);
            setRefunds(refundsResponse.data);
        } catch {
            setErrorMessage("订单读取失败，请检查订单是否存在。");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReservation().then(r => r);
    }, [reservationId]);

    const status = reservation ? statusMeta[reservation.status] : statusMeta.PENDING_PAYMENT;
    const paymentDeadline = useMemo(() => reservation?.paymentDeadline ? new Date(reservation.paymentDeadline).getTime() : Date.now(), [reservation?.paymentDeadline]);
    const canPay = reservation?.status === "PENDING_PAYMENT";
    const canCancel = reservation && !["CANCELLED", "EXPIRED", "REFUND_PROCESSING", "REFUNDED"].includes(reservation.status);
    const cancellationTime = reservation?.cancelledAt || reservation?.refundRequestedAt || reservation?.refundedAt;
    const cancellationCompleted = Boolean(cancellationTime) || ["CANCELLED", "REFUND_PROCESSING", "REFUNDED"].includes(reservation?.status ?? "PENDING_PAYMENT");

    const submitPayment = async () => {
        if (!reservation) return;
        setSubmitting(true);
        setErrorMessage("");
        setSuccessMessage("");
        try {
            await ApiRequests.payForReservation({reservationId: reservation.id, cardNumber});
            setPayDialogOpen(false);
            setSuccessMessage("支付成功，订单状态已经更新。");
            await loadReservation();
        } catch {
            setErrorMessage("支付未通过。演示环境中，可使用末位为偶数的 16 位银行卡号重试。");
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
            const response = await ApiRequests.cancelReservation(reservation.id, cancellationReason || "行程有变");
            setReservation(response.data);
            setCancelDialogOpen(false);
            setSuccessMessage(reservation.status === "PAID" ? "退款申请已提交。" : "订单已取消。");
            await loadReservation();
        } catch {
            setErrorMessage("取消申请失败，请稍后重试。");
        } finally {
            setSubmitting(false);
        }
    };

    const completeRefund = async () => {
        if (!reservation) return;
        setSubmitting(true);
        setErrorMessage("");
        setSuccessMessage("");
        try {
            const response = await ApiRequests.completeRefund(reservation.id);
            setReservation(response.data);
            setSuccessMessage("退款已完成，订单状态已更新。");
            await loadReservation();
        } catch {
            setErrorMessage("完成退款失败，请确认订单处于退款处理中。");
        } finally {
            setSubmitting(false);
        }
    };

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

    return (
        <main className="min-h-screen bg-slate-50 px-8 py-10">
            <div className="mx-auto max-w-6xl">
                <Button component={Link} to="/reservations" startIcon={<ArrowBack/>}>返回我的预订</Button>

                <section className="mt-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                <Chip color={status.color} label={status.label}/>
                                <Chip variant="outlined" label={reservation.bookingType}/>
                            </div>
                            <h1 className="text-3xl font-bold text-slate-950">{reservation.title || "旅行预订"}</h1>
                            <p className="mt-2 text-sm text-slate-500">订单号：{reservation.id}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-slate-500">订单金额</p>
                            <p className="mt-1 text-3xl font-bold text-orange-500">¥{Math.ceil(reservation.price).toLocaleString()}</p>
                        </div>
                    </div>
                    <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">{status.description}</p>

                    {canPay &&
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                            <div>
                                <p className="text-sm font-semibold text-amber-900">支付剩余时间</p>
                                <Countdown date={paymentDeadline} onComplete={() => loadReservation().then(r => r)}/>
                            </div>
                            <Button variant="contained" startIcon={<CreditCard/>} onClick={() => setPayDialogOpen(true)}>立即支付</Button>
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
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div><p className="text-xs text-slate-400">出发 / 入住</p><p className="mt-1 font-semibold">{formatDate(reservation.hotelTimeFrom)}</p></div>
                                <div><p className="text-xs text-slate-400">到达 / 离店</p><p className="mt-1 font-semibold">{formatDate(reservation.hotelTimeTo)}</p></div>
                                {reservation.routeFrom && <div><p className="text-xs text-slate-400">路线</p><p className="mt-1 font-semibold">{reservation.routeFrom} → {reservation.routeTo}</p></div>}
                                {reservation.provider && <div><p className="text-xs text-slate-400">服务方 / 房型</p><p className="mt-1 font-semibold">{reservation.provider}</p></div>}
                                {reservation.bookingCode && <div><p className="text-xs text-slate-400">确认编号</p><p className="mt-1 font-semibold">{reservation.bookingCode}</p></div>}
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
                                <TimelineItem active title="订单已创建" time={reservation.createdAt}/>
                                <TimelineItem active={Boolean(reservation.paidAt)} title="支付成功" time={reservation.paidAt}/>
                                <TimelineItem active={cancellationCompleted} title="订单取消" time={cancellationTime}/>
                                <TimelineItem active={Boolean(reservation.refundRequestedAt)} title="退款申请" time={reservation.refundRequestedAt}/>
                                <TimelineItem active={Boolean(reservation.refundedAt)} title="退款完成" time={reservation.refundedAt}/>
                            </div>
                        </Paper>

                        <Paper elevation={0} className="border border-slate-200 p-6">
                            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><ReceiptLong/> 订单操作</h2>
                            <div className="mt-4 grid gap-3">
                                <Button variant="outlined" startIcon={<Refresh/>} onClick={loadReservation}>刷新状态</Button>
                                {canCancel && <Button color="error" variant="outlined" startIcon={<Cancel/>} onClick={() => setCancelDialogOpen(true)}>
                                    {reservation.status === "PAID" ? "申请退款" : "取消订单"}
                                </Button>}
                                {reservation.status === "REFUND_PROCESSING" &&
                                    <Button color="success" variant="contained" disabled={submitting} onClick={completeRefund}>
                                        演示完成退款
                                    </Button>
                                }
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
                                            {formatDate(payment.createdAt)} · 尾号 {payment.cardLast4 || "----"}
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
                                        <p className="mt-2 text-xs text-slate-500">申请：{formatDate(refund.requestedAt)}</p>
                                        {refund.completedAt && <p className="mt-1 text-xs text-slate-500">完成：{formatDate(refund.completedAt)}</p>}
                                        {refund.reason && <p className="mt-1 text-xs text-slate-500">原因：{refund.reason}</p>}
                                    </div>
                                ))}
                                {refunds.length === 0 && <p className="text-sm text-slate-500">暂无退款记录</p>}
                            </div>
                        </Paper>
                    </div>
                </div>
            </div>

            <Dialog open={payDialogOpen} onClose={() => setPayDialogOpen(false)} fullWidth maxWidth="xs">
                <DialogTitle>模拟支付</DialogTitle>
                <DialogContent>
                    <Alert severity="info" className="mb-4">演示环境：16 位卡号末位为偶数时支付成功。</Alert>
                    <TextField fullWidth label="银行卡号" value={cardNumber} onChange={event => setCardNumber(event.target.value.replace(/\D/g, "").slice(0, 16))}/>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPayDialogOpen(false)}>稍后支付</Button>
                    <Button variant="contained" disabled={submitting || cardNumber.length !== 16} onClick={submitPayment}>确认支付</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={cancelDialogOpen} onClose={() => setCancelDialogOpen(false)} fullWidth maxWidth="xs">
                <DialogTitle>{reservation.status === "PAID" ? "申请退款" : "取消订单"}</DialogTitle>
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
        </main>
    );
}
