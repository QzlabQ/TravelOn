import React, {useEffect, useMemo, useState} from "react";
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    InputAdornment,
    MenuItem,
    TextField
} from "@mui/material";
import {SavedBankCard} from "../../core/currentUser";
import {validateRechargeAmount} from "../../core/validation";

export type WalletTopUpDialogPayload = {
    amount: number;
    cardId: string;
    payerName: string;
    payerPhone: string;
    cardNumber: string;
    accountLabel: string;
    referenceNo: string;
};

type WalletTopUpDialogProps = {
    open: boolean;
    defaultAmount?: string;
    savedCards: SavedBankCard[];
    submitting?: boolean;
    onClose: () => void;
    onConfirm: (payload: WalletTopUpDialogPayload) => Promise<void> | void;
    onAddCard?: () => void;
};

const formatCurrency = (value: number) => `¥${value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

const createReferenceNo = () => {
    const now = new Date();
    const parts = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
        String(now.getSeconds()).padStart(2, "0"),
    ];
    const randomPart = Math.floor(Math.random() * 9000 + 1000);
    return `CZ${parts.join("")}${randomPart}`;
};

const maskPhone = (value?: string) => {
    if (!value) return "未预留";
    return `${value.slice(0, 3)}****${value.slice(-4)}`;
};

const getInitialCardId = (cards: SavedBankCard[]) => cards.find(card => card.defaultCard)?.id || cards[0]?.id || "";

export default function WalletTopUpDialog({
    open,
    defaultAmount = "",
    savedCards,
    submitting = false,
    onClose,
    onConfirm,
    onAddCard,
}: WalletTopUpDialogProps) {
    const [amount, setAmount] = useState(defaultAmount);
    const [selectedCardId, setSelectedCardId] = useState(getInitialCardId(savedCards));
    const [dialogError, setDialogError] = useState("");
    const [internalSubmitting, setInternalSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;
        setAmount(defaultAmount);
        setSelectedCardId(getInitialCardId(savedCards));
        setDialogError("");
        setInternalSubmitting(false);
    }, [open, defaultAmount, savedCards]);

    const selectedCard = useMemo(
        () => savedCards.find(card => card.id === selectedCardId) ?? null,
        [savedCards, selectedCardId]
    );
    const amountError = validateRechargeAmount(amount);
    const cardError = savedCards.length === 0 ? "请先添加银联卡后再充值。" : (!selectedCard ? "请选择充值银联卡。" : "");

    const handleConfirm = async () => {
        const errors = [amountError, cardError].filter(Boolean);
        if (errors.length > 0 || !selectedCard) {
            setDialogError(errors[0] || "请选择充值银联卡。");
            return;
        }

        const payload: WalletTopUpDialogPayload = {
            amount: Number(amount),
            cardId: selectedCard.id,
            payerName: selectedCard.holderName,
            payerPhone: selectedCard.reservedPhone,
            cardNumber: selectedCard.cardNumber,
            accountLabel: `${selectedCard.bankName || "银联卡"} 尾号 ${selectedCard.cardNumber.slice(-4)}`,
            referenceNo: createReferenceNo(),
        };

        try {
            setInternalSubmitting(true);
            setDialogError("");
            await onConfirm(payload);
            onClose();
        } catch (error: any) {
            setDialogError(error?.message || "充值失败，请稍后重试。");
        } finally {
            setInternalSubmitting(false);
        }
    };

    const effectiveSubmitting = submitting || internalSubmitting;

    return (
        <Dialog open={open} onClose={effectiveSubmitting ? undefined : onClose} fullWidth maxWidth="sm">
            <DialogTitle>钱包充值</DialogTitle>
            <DialogContent className="space-y-4 pt-2">
                <Alert severity="info">
                    充值前请先绑定银联卡，确认后会实时计入钱包余额。
                </Alert>
                {dialogError && <Alert severity="error">{dialogError}</Alert>}

                <TextField
                    fullWidth
                    label="充值金额"
                    value={amount}
                    onChange={event => setAmount(event.target.value)}
                    error={Boolean(amount && amountError)}
                    helperText={amount ? amountError || "单笔 10 - 50,000 元，实时到账。" : "单笔 10 - 50,000 元，实时到账。"}
                    InputProps={{
                        startAdornment: <InputAdornment position="start">¥</InputAdornment>
                    }}
                />

                {savedCards.length > 0 ? (
                    <>
                        <TextField
                            select
                            fullWidth
                            label="选择银联卡"
                            value={selectedCardId}
                            onChange={event => setSelectedCardId(event.target.value)}
                            error={Boolean(cardError)}
                            helperText={cardError || "支持从已绑定银联卡中选择本次充值账户。"}
                        >
                            {savedCards.map(card => (
                                <MenuItem key={card.id} value={card.id}>
                                    {`${card.bankName} · 尾号 ${card.cardNumber.slice(-4)}${card.defaultCard ? "（默认）" : ""}`}
                                </MenuItem>
                            ))}
                        </TextField>

                        {selectedCard && (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                <p>发卡行：{selectedCard.bankName}</p>
                                <p className="mt-1">卡片类型：{selectedCard.cardBrand} / {selectedCard.cardType}</p>
                                <p className="mt-1">持卡人：{selectedCard.holderName}</p>
                                <p className="mt-1">预留手机号：{maskPhone(selectedCard.reservedPhone)}</p>
                                <p className="mt-1">本次将到账：{amount && !amountError ? formatCurrency(Number(amount)) : "--"}</p>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                        <p>当前还没有已绑定银联卡。</p>
                        <p className="mt-1">请先添加银联卡，之后充值时就可以直接选择。</p>
                        {onAddCard && (
                            <Button className="mt-3" variant="outlined" onClick={onAddCard}>
                                添加银联卡
                            </Button>
                        )}
                    </div>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={effectiveSubmitting}>取消</Button>
                <Button variant="contained" onClick={handleConfirm} disabled={effectiveSubmitting || savedCards.length === 0}>
                    {effectiveSubmitting ? "充值中..." : "确认充值"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
