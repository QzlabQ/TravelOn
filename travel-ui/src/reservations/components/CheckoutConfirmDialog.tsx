import React from "react";
import {
    Alert,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider
} from "@mui/material";
import {BookingPersonPayload, TravelerType} from "../../core/apiConfig";

export type CheckoutSummaryRow = {
    label: string;
    value: string;
};

export type CheckoutPriceRow = {
    label: string;
    value: string;
};

type CheckoutConfirmDialogProps = {
    open: boolean;
    title: string;
    subtitle?: string;
    travelers: BookingPersonPayload[];
    summaryRows: CheckoutSummaryRow[];
    priceRows: CheckoutPriceRow[];
    totalPrice: number;
    rules: string[];
    submitting?: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

const travelerTypeLabel = (type: TravelerType) => {
    if (type === "CHILD") return "儿童";
    if (type === "STUDENT") return "学生";
    return "成人";
};

const maskValue = (value?: string, visibleStart = 3, visibleEnd = 4) => {
    if (!value) return "未填写";
    if (value.length <= visibleStart + visibleEnd) return value.replace(/.(?=.{1})/g, "*");
    return `${value.slice(0, visibleStart)}${"*".repeat(Math.max(3, value.length - visibleStart - visibleEnd))}${value.slice(-visibleEnd)}`;
};

const formatCurrency = (value: number) => `¥${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

export default function CheckoutConfirmDialog({
    open,
    title,
    subtitle,
    travelers,
    summaryRows,
    priceRows,
    totalPrice,
    rules,
    submitting = false,
    onClose,
    onConfirm
}: CheckoutConfirmDialogProps) {
    return (
        <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="md">
            <DialogTitle>{title}</DialogTitle>
            <DialogContent>
                {subtitle && <Alert severity="info" className="mb-4">{subtitle}</Alert>}

                <div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr]">
                    <section className="rounded-lg border border-slate-200 p-4">
                        <h3 className="font-semibold text-slate-900">乘客 / 入住人</h3>
                        <div className="mt-3 grid gap-2">
                            {travelers.map((traveler, index) => (
                                <div key={`${traveler.name}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold text-slate-900">{traveler.name || `人员 ${index + 1}`}</span>
                                        <Chip size="small" label={travelerTypeLabel(traveler.travelerType)}/>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {traveler.documentType || "证件"}：{maskValue(traveler.documentNumber)}
                                        {traveler.phone ? ` · 手机 ${maskValue(traveler.phone, 3, 4)}` : ""}
                                    </p>
                                </div>
                            ))}
                            {travelers.length === 0 && <p className="text-sm text-slate-500">还没有选择人员。</p>}
                        </div>
                    </section>

                    <section className="rounded-lg border border-slate-200 p-4">
                        <h3 className="font-semibold text-slate-900">行程摘要</h3>
                        <div className="mt-3 grid gap-2 text-sm">
                            {summaryRows.map(row => (
                                <div key={row.label} className="flex items-center justify-between gap-3">
                                    <span className="text-slate-500">{row.label}</span>
                                    <span className="text-right font-semibold text-slate-900">{row.value}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <section className="mt-5 rounded-lg border border-slate-200 p-4">
                    <h3 className="font-semibold text-slate-900">价格明细</h3>
                    <div className="mt-3 grid gap-2 text-sm">
                        {priceRows.map(row => (
                            <div key={row.label} className="flex items-center justify-between">
                                <span className="text-slate-500">{row.label}</span>
                                <span className="font-semibold text-slate-900">{row.value}</span>
                            </div>
                        ))}
                    </div>
                    <Divider className="my-3"/>
                    <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">应付金额</span>
                        <span className="text-2xl font-bold text-orange-500">{formatCurrency(totalPrice)}</span>
                    </div>
                </section>

                <section className="mt-5 rounded-lg bg-amber-50 p-4">
                    <h3 className="font-semibold text-amber-900">退改规则</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                        {rules.map(rule => <li key={rule}>{rule}</li>)}
                    </ul>
                </section>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={submitting}>返回修改</Button>
                <Button variant="contained" onClick={onConfirm} disabled={submitting || travelers.length === 0}>
                    {submitting ? "提交中..." : "确认提交订单"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
