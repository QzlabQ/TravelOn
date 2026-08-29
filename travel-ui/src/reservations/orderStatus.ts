import {RefundRecordResponse, ReservationResponse, ReservationStatus} from "../core/apiConfig";

export type ReservationStatusColor = "default" | "success" | "warning" | "error" | "info";

export const reservationStatusMeta: Record<ReservationStatus, {
    label: string;
    color: ReservationStatusColor;
    description: string;
}> = {
    PENDING_PAYMENT: {label: "待支付", color: "warning", description: "订单已创建，请在倒计时结束前完成支付。"},
    PAID: {label: "已支付", color: "success", description: "支付成功，出行信息已经确认。"},
    CANCELLED: {label: "已取消", color: "default", description: "订单已取消，无需继续支付。"},
    EXPIRED: {label: "已超时", color: "error", description: "订单超过支付时间，请重新预订。"},
    REFUND_PROCESSING: {label: "退款处理中", color: "info", description: "退款申请已提交，平台正在处理。"},
    REFUNDED: {label: "已退款", color: "success", description: "退款已经完成。"},
};

export const parseSystemDate = (value?: string | null) => {
    if (!value) return null;
    const normalizedValue = value.trim();
    if (!normalizedValue) return null;

    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalizedValue)) {
        return new Date(normalizedValue);
    }

    return new Date(`${normalizedValue}Z`);
};

export const formatSystemDate = (value?: string | null) => {
    const date = parseSystemDate(value);
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "-";
};

export const formatTripDate = (value?: string | null) => value ? new Date(value).toLocaleString() : "-";

export const toDateInputValue = (value?: string | null) => value ? value.slice(0, 10) : undefined;

export const getPaymentDeadlineMillis = (reservation?: ReservationResponse | null) => {
    const deadline = parseSystemDate(reservation?.paymentDeadline);
    if (deadline && !Number.isNaN(deadline.getTime())) {
        return deadline.getTime();
    }

    const createdAt = parseSystemDate(reservation?.createdAt);
    if (createdAt && !Number.isNaN(createdAt.getTime())) {
        return createdAt.getTime() + 30 * 60 * 1000;
    }

    return Date.now();
};

export const isReservationPaymentExpired = (reservation: ReservationResponse, now = Date.now()) => {
    if (reservation.paid || reservation.paidAt) return false;
    if (reservation.cancelledAt || reservation.refundRequestedAt || reservation.refundedAt) return false;
    return getPaymentDeadlineMillis(reservation) <= now;
};

export const getEffectiveReservationStatus = (
    reservation: ReservationResponse,
    refunds: RefundRecordResponse[] = [],
    now = Date.now()
): ReservationStatus => {
    const hasCompletedRefund = refunds.some(refund => refund.status === "COMPLETED");
    if (
        reservation.status === "REFUNDED" ||
        reservation.refundedAt ||
        hasCompletedRefund
    ) {
        return "REFUNDED";
    }

    const hasProcessingRefund = refunds.some(refund => refund.status === "PROCESSING");
    if (
        reservation.status === "REFUND_PROCESSING" ||
        reservation.refundRequestedAt ||
        hasProcessingRefund
    ) {
        return "REFUND_PROCESSING";
    }

    if (reservation.cancelledAt || reservation.status === "CANCELLED") {
        return "CANCELLED";
    }

    if (reservation.paidAt || reservation.paid || reservation.status === "PAID") {
        return "PAID";
    }

    if (reservation.status === "EXPIRED") {
        return isReservationPaymentExpired(reservation, now) ? "EXPIRED" : "PENDING_PAYMENT";
    }

    if (reservation.status === "PENDING_PAYMENT" && isReservationPaymentExpired(reservation, now)) {
        return "EXPIRED";
    }

    return reservation.status || "PENDING_PAYMENT";
};

export const getReservationStatusMeta = (
    reservation: ReservationResponse,
    refunds: RefundRecordResponse[] = [],
    now = Date.now()
) => {
    const status = getEffectiveReservationStatus(reservation, refunds, now);
    return reservationStatusMeta[status] ?? reservationStatusMeta.PENDING_PAYMENT;
};

export const canPayReservation = (reservation: ReservationResponse, refunds: RefundRecordResponse[] = []) => {
    return getEffectiveReservationStatus(reservation, refunds) === "PENDING_PAYMENT";
};

export const canCancelReservation = (reservation: ReservationResponse, refunds: RefundRecordResponse[] = []) => {
    return !["CANCELLED", "EXPIRED", "REFUND_PROCESSING", "REFUNDED"].includes(getEffectiveReservationStatus(reservation, refunds));
};
