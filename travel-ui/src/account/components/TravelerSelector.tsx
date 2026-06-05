import React, {useEffect, useMemo, useState} from "react";
import {
    Alert,
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    MenuItem,
    TextField
} from "@mui/material";
import {Add, Person, PersonAdd} from "@mui/icons-material";
import {ApiRequests, BookingPersonPayload, TravelerResponse, TravelerType} from "../../core/apiConfig";
import {useAuthSession} from "../../core/useAuthSession";

type TravelerSelectorProps = {
    title?: string;
    single?: boolean;
    onChange: (travelers: BookingPersonPayload[]) => void;
};

const typeLabel = (type: TravelerType) => {
    if (type === "CHILD") return "儿童";
    if (type === "STUDENT") return "学生";
    return "成人";
};

const toBookingPerson = (traveler: TravelerResponse): BookingPersonPayload => ({
    travelerId: traveler.id,
    name: traveler.name,
    travelerType: traveler.travelerType,
    documentType: traveler.documentType,
    documentNumber: traveler.documentNumber,
    phone: traveler.phone,
});

const maskValue = (value?: string, visibleStart = 3, visibleEnd = 4) => {
    if (!value) return "";
    if (value.length <= visibleStart + visibleEnd) return value.replace(/.(?=.{1})/g, "*");
    return `${value.slice(0, visibleStart)}${"*".repeat(Math.max(3, value.length - visibleStart - visibleEnd))}${value.slice(-visibleEnd)}`;
};

export default function TravelerSelector({title = "选择出行人", single = false, onChange}: TravelerSelectorProps) {
    const session = useAuthSession();
    const canSelectTraveler = Boolean(session);
    const accountTraveler = useMemo(() => session?.user ? {
        name: `${session.user.name || ""}${session.user.surname ? ` ${session.user.surname}` : ""}`.trim(),
        travelerType: "ADULT" as TravelerType,
        documentType: "账号资料",
        phone: session.user.phone || undefined,
    } : null, [session?.user.id, session?.user.name, session?.user.surname, session?.user.phone]);
    const [savedTravelers, setSavedTravelers] = useState<TravelerResponse[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [accountTravelerSelected, setAccountTravelerSelected] = useState(false);
    const [temporaryTravelers, setTemporaryTravelers] = useState<BookingPersonPayload[]>([]);
    const [temporaryDialogOpen, setTemporaryDialogOpen] = useState(false);
    const [temporaryTravelerForm, setTemporaryTravelerForm] = useState<BookingPersonPayload>({
        name: "",
        travelerType: "ADULT",
        documentType: "身份证",
        documentNumber: "",
    });
    const [temporaryTravelerError, setTemporaryTravelerError] = useState("");
    const [loadingError, setLoadingError] = useState(false);

    useEffect(() => {
        if (!session) {
            setSavedTravelers([]);
            setSelectedIds([]);
            setAccountTravelerSelected(false);
            setTemporaryTravelers([]);
            return;
        }

        ApiRequests.listTravelers(session.token)
            .then(response => {
                setSavedTravelers(response.data);
                const preferred = response.data.find(item => item.defaultTraveler) ?? response.data[0];
                if (preferred) {
                    setSelectedIds([preferred.id]);
                }
            })
            .catch(() => setLoadingError(true));
    }, [session?.token]);

    const selectedTravelers = useMemo(() => [
        ...savedTravelers.filter(item => selectedIds.includes(item.id)).map(toBookingPerson),
        ...(accountTravelerSelected && accountTraveler?.name ? [accountTraveler] : []),
        ...temporaryTravelers
    ], [accountTraveler, accountTravelerSelected, savedTravelers, selectedIds, temporaryTravelers]);

    useEffect(() => {
        onChange(selectedTravelers);
    }, [selectedTravelers]);

    const toggleSavedTraveler = (travelerId: string) => {
        if (!canSelectTraveler) return;

        setSelectedIds(previous => {
            if (single) {
                setTemporaryTravelers([]);
                setAccountTravelerSelected(false);
                return previous.includes(travelerId) ? [] : [travelerId];
            }
            return previous.includes(travelerId)
                ? previous.filter(id => id !== travelerId)
                : [...previous, travelerId];
        });
    };

    const toggleAccountTraveler = () => {
        if (!canSelectTraveler) return;

        setAccountTravelerSelected(previous => {
            if (single && !previous) {
                setSelectedIds([]);
                setTemporaryTravelers([]);
            }
            return !previous;
        });
    };

    const openTemporaryTravelerDialog = () => {
        if (!canSelectTraveler) return;

        setTemporaryTravelerForm({
            name: "",
            travelerType: "ADULT",
            documentType: "身份证",
            documentNumber: "",
        });
        setTemporaryTravelerError("");
        setTemporaryDialogOpen(true);
    };

    const closeTemporaryTravelerDialog = () => {
        setTemporaryDialogOpen(false);
        setTemporaryTravelerError("");
    };

    const addTemporaryTraveler = () => {
        const trimmedName = temporaryTravelerForm.name.trim();
        const trimmedDocumentNumber = temporaryTravelerForm.documentNumber?.trim() || "";
        if (!trimmedName) {
            setTemporaryTravelerError("请填写出行人姓名。");
            return;
        }
        if (!trimmedDocumentNumber) {
            setTemporaryTravelerError("请填写身份证号。");
            return;
        }
        if (trimmedDocumentNumber.length > 48) {
            setTemporaryTravelerError("身份证号不能超过 48 个字符。");
            return;
        }

        const traveler = {
            name: trimmedName,
            travelerType: temporaryTravelerForm.travelerType,
            documentType: "身份证",
            documentNumber: trimmedDocumentNumber,
        };

        if (single) {
            setSelectedIds([]);
            setAccountTravelerSelected(false);
            setTemporaryTravelers([traveler]);
        } else {
            setTemporaryTravelers(previous => [...previous, traveler]);
        }
        closeTemporaryTravelerDialog();
    };

    const removeTemporaryTraveler = (index: number) => {
        setTemporaryTravelers(previous => previous.filter((_, itemIndex) => itemIndex !== index));
    };

    return (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">{title}</h2>
                    <p className="mt-1 text-xs text-slate-500">订单会保存本次选择的人员快照</p>
                </div>
                <Chip size="small" icon={<Person/>} label={`${selectedTravelers.length} 人`}/>
            </div>

            {!canSelectTraveler &&
                <Alert severity="info" className="mb-3">
                    未登录时可以浏览价格和详情；登录后才能选择出行人并提交订单。
                </Alert>
            }

            {loadingError && <Alert severity="warning" className="mb-3">常用出行人读取失败，仍可临时填写。</Alert>}

            {accountTraveler?.name &&
                <div className="mb-4">
                    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 hover:bg-blue-100">
                        <FormControlLabel
                            className="m-0"
                            control={<Checkbox size="small" checked={accountTravelerSelected} disabled={!canSelectTraveler} onChange={toggleAccountTraveler}/>}
                            label={
                                <span>
                                    <span className="text-sm font-semibold text-slate-800">账号本人：{accountTraveler.name}</span>
                                    {accountTraveler.phone && <span className="ml-2 text-xs text-slate-500">{maskValue(accountTraveler.phone)}</span>}
                                </span>
                            }
                        />
                        <Chip size="small" color="primary" variant="outlined" label="本人"/>
                    </label>
                </div>
            }

            {savedTravelers.length > 0 &&
                <div className="mb-4 grid gap-2">
                    {savedTravelers.map(traveler => (
                        <label key={traveler.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
                            <FormControlLabel
                                className="m-0"
                                control={<Checkbox size="small" checked={selectedIds.includes(traveler.id)} disabled={!canSelectTraveler} onChange={() => toggleSavedTraveler(traveler.id)}/>}
                                label={
                                    <span>
                                        <span className="text-sm font-semibold text-slate-800">{traveler.name}</span>
                                        <span className="ml-2 text-xs text-slate-500">
                                            {traveler.documentNumber ? maskValue(traveler.documentNumber) : traveler.phone ? maskValue(traveler.phone) : ""}
                                        </span>
                                    </span>
                                }
                            />
                            <div className="flex gap-1">
                                {traveler.defaultTraveler && <Chip size="small" label="默认"/>}
                                <Chip size="small" variant="outlined" label={typeLabel(traveler.travelerType)}/>
                            </div>
                        </label>
                    ))}
                </div>
            }

            {temporaryTravelers.length > 0 &&
                <div className="mb-4 flex flex-wrap gap-2">
                    {temporaryTravelers.map((traveler, index) => (
                        <Chip
                            key={`${traveler.name}-${index}`}
                            color="primary"
                            variant="outlined"
                            label={`${traveler.name} · ${typeLabel(traveler.travelerType)} · 身份证 ${maskValue(traveler.documentNumber)}`}
                            onDelete={() => removeTemporaryTraveler(index)}
                        />
                    ))}
                </div>
            }

            <p className="mb-2 text-sm font-semibold text-slate-700">
                {session ? "临时增加本次出行人" : "填写本次出行人"}
            </p>
            <Button variant="outlined" startIcon={session ? <Add/> : <PersonAdd/>} disabled={!canSelectTraveler} onClick={openTemporaryTravelerDialog}>
                {canSelectTraveler ? "添加临时出行人" : "登录后添加"}
            </Button>

            <Dialog open={temporaryDialogOpen} onClose={closeTemporaryTravelerDialog} fullWidth maxWidth="sm">
                <DialogTitle>添加临时出行人</DialogTitle>
                <DialogContent className="space-y-4 pt-2">
                    <p className="text-sm text-slate-500">临时出行人只用于本次订单，不会保存到常用出行人。</p>
                    {temporaryTravelerError && <Alert severity="error">{temporaryTravelerError}</Alert>}
                    <TextField
                        autoFocus
                        fullWidth
                        label="姓名"
                        value={temporaryTravelerForm.name}
                        onChange={event => setTemporaryTravelerForm({...temporaryTravelerForm, name: event.target.value})}
                    />
                    <TextField
                        select
                        fullWidth
                        label="人员类型"
                        value={temporaryTravelerForm.travelerType}
                        onChange={event => setTemporaryTravelerForm({...temporaryTravelerForm, travelerType: event.target.value as TravelerType})}
                    >
                        <MenuItem value="ADULT">成人</MenuItem>
                        <MenuItem value="CHILD">儿童</MenuItem>
                        <MenuItem value="STUDENT">学生</MenuItem>
                    </TextField>
                    <TextField
                        fullWidth
                        required
                        label="身份证号"
                        value={temporaryTravelerForm.documentNumber}
                        onChange={event => setTemporaryTravelerForm({...temporaryTravelerForm, documentNumber: event.target.value})}
                        helperText="提交订单时会保存脱敏证件信息。"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeTemporaryTravelerDialog}>取消</Button>
                    <Button variant="contained" onClick={addTemporaryTraveler}>添加</Button>
                </DialogActions>
            </Dialog>
        </section>
    );
}
