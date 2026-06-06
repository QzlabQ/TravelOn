import React, {useEffect, useMemo, useState} from "react";
import {
    Alert,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    TextField
} from "@mui/material";
import {SavedBankCardPayload} from "../../core/currentUser";
import {
    getBankCardIssuerInfo,
    normalizeChinaMainlandPhone,
    normalizeDigits,
    validateBankCard,
    validateChinaMainlandPhone
} from "../../core/validation";

type BankCardEditorDialogProps = {
    open: boolean;
    defaultHolderName?: string;
    defaultPhone?: string;
    suggestDefault?: boolean;
    onClose: () => void;
    onConfirm: (payload: SavedBankCardPayload) => Promise<void> | void;
};

export default function BankCardEditorDialog({
    open,
    defaultHolderName = "",
    defaultPhone = "",
    suggestDefault = false,
    onClose,
    onConfirm,
}: BankCardEditorDialogProps) {
    const [holderName, setHolderName] = useState(defaultHolderName);
    const [reservedPhone, setReservedPhone] = useState(defaultPhone);
    const [cardNumber, setCardNumber] = useState("");
    const [defaultCard, setDefaultCard] = useState(suggestDefault);
    const [dialogError, setDialogError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;
        setHolderName(defaultHolderName);
        setReservedPhone(defaultPhone);
        setCardNumber("");
        setDefaultCard(suggestDefault);
        setDialogError("");
        setSubmitting(false);
    }, [open, defaultHolderName, defaultPhone, suggestDefault]);

    const issuerInfo = useMemo(() => getBankCardIssuerInfo(cardNumber), [cardNumber]);
    const holderNameError = holderName.trim() ? "" : "请输入持卡人姓名。";
    const phoneError = validateChinaMainlandPhone(reservedPhone, true);
    const cardNumberError = validateBankCard(cardNumber);

    const handleConfirm = async () => {
        const errors = [holderNameError, phoneError, cardNumberError].filter(Boolean);
        if (errors.length > 0) {
            setDialogError(errors[0]);
            return;
        }

        try {
            setSubmitting(true);
            setDialogError("");
            await onConfirm({
                bankName: issuerInfo?.bankName || "银联卡",
                cardBrand: issuerInfo?.cardBrand || "银联",
                cardType: issuerInfo?.cardType || "借记卡",
                cardNumber: normalizeDigits(cardNumber),
                holderName: holderName.trim(),
                reservedPhone: normalizeChinaMainlandPhone(reservedPhone),
                defaultCard,
            });
            onClose();
        } catch (error: any) {
            setDialogError(error?.message || "添加银联卡失败，请稍后重试。");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm">
            <DialogTitle>添加银联卡</DialogTitle>
            <DialogContent className="space-y-4 pt-2">
                <Alert severity="info">
                    绑定后可在钱包充值时直接选择银联卡，无需每次重复输入卡信息。
                </Alert>
                {dialogError && <Alert severity="error">{dialogError}</Alert>}

                <TextField
                    fullWidth
                    label="持卡人姓名"
                    value={holderName}
                    onChange={event => setHolderName(event.target.value)}
                    error={Boolean(holderName && holderNameError)}
                    helperText={holderName ? holderNameError || "需与银联卡开户名保持一致。" : "需与银联卡开户名保持一致。"}
                />
                <TextField
                    fullWidth
                    label="预留手机号"
                    value={reservedPhone}
                    onChange={event => setReservedPhone(event.target.value)}
                    error={Boolean(reservedPhone && phoneError)}
                    helperText={reservedPhone ? phoneError || "用于快捷充值身份校验。" : "用于快捷充值身份校验。"}
                />
                <TextField
                    fullWidth
                    label="银联卡号"
                    value={cardNumber}
                    onChange={event => setCardNumber(normalizeDigits(event.target.value).slice(0, 19))}
                    error={Boolean(cardNumber && cardNumberError)}
                    helperText={cardNumber
                        ? cardNumberError || `已识别 ${issuerInfo?.displayName || "暂未识别归属行"}`
                        : "仅支持 16-19 位银联卡号。"}
                />
                <FormControlLabel
                    control={<Checkbox checked={defaultCard} onChange={event => setDefaultCard(event.target.checked)}/>}
                    label="设为默认充值卡"
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={submitting}>取消</Button>
                <Button variant="contained" onClick={handleConfirm} disabled={submitting}>
                    {submitting ? "保存中..." : "保存银联卡"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
