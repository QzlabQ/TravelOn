import React, {useEffect, useMemo, useState} from "react";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    InputAdornment,
    MenuItem,
    TextField,
} from "@mui/material";
import {Add, Close, Landscape, Place} from "@mui/icons-material";
import {
    ApiRequests,
    AttractionResponse,
    CreateTravelRoutePayload,
    resolveCommunityImageUrl,
    RouteStopInput,
    TravelRouteDetailResponse,
    TravelStyle,
} from "../../core/apiConfig";
import CommunityImageUploader from "./CommunityImageUploader";
import AttractionPickerDialog from "./AttractionPickerDialog";
import {travelStyleLabels} from "./communityLabels";

type Props = {
    open: boolean,
    token?: string,
    route?: TravelRouteDetailResponse | null,
    onClose: () => void,
    onPublished: () => void,
};

type DraftStop = {
    attractionId: string,
    attractionName: string,
    attractionCity?: string | null,
    coverImageUrl?: string | null,
    dayNumber: number,
    note: string,
};

type Meta = {
    title: string,
    summary: string,
    style: TravelStyle,
    cityId: string,
    days: number,
    peopleCount: number,
    budget: number,
    imageUrls: string[],
};

const defaultMeta: Meta = {
    title: "",
    summary: "",
    style: "LEISURE",
    cityId: "",
    days: 3,
    peopleCount: 2,
    budget: 2000,
    imageUrls: [],
};

const styleOptions = (Object.keys(travelStyleLabels) as TravelStyle[]).map(value => ({value, label: travelStyleLabels[value]}));

const RoutePublishDialog = ({open, token, route, onClose, onPublished}: Props) => {
    const [meta, setMeta] = useState<Meta>(defaultMeta);
    const [stops, setStops] = useState<DraftStop[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [cityOptions, setCityOptions] = useState<{cityId: string, label: string}[]>([]);
    const [pickerDay, setPickerDay] = useState<number | null>(null);

    useEffect(() => {
        if (!open) return;
        setMeta(route ? {
            title: route.title,
            summary: route.summary ?? "",
            style: route.style,
            cityId: route.cityId ?? "",
            days: route.days,
            peopleCount: route.peopleCount,
            budget: route.budget,
            imageUrls: route.imageUrls,
        } : defaultMeta);
        setStops(route ? route.stops.map(stop => ({
            attractionId: stop.attractionId,
            attractionName: stop.attractionName,
            attractionCity: stop.attractionCity,
            coverImageUrl: stop.coverImageUrl,
            dayNumber: stop.dayNumber,
            note: stop.note ?? "",
        })) : []);
        setError("");
    }, [open, route]);

    useEffect(() => {
        if (!open || cityOptions.length > 0) return;
        ApiRequests.getHotelDestinations()
            .then(res => {
                const seen = new Set<string>();
                const opts = res.data
                    .filter(d => d.cityId && d.region)
                    .filter(d => { if (seen.has(d.cityId)) return false; seen.add(d.cityId); return true; })
                    .map(d => ({cityId: d.cityId, label: d.region}))
                    .sort((a, b) => a.label.localeCompare(b.label, "zh"));
                setCityOptions(opts);
            })
            .catch(() => {});
    }, [open, cityOptions.length]);

    const dayList = useMemo(() => Array.from({length: Math.max(1, meta.days)}, (_, i) => i + 1), [meta.days]);

    const handlePick = (attraction: AttractionResponse) => {
        const day = pickerDay ?? 1;
        setStops(current => [...current, {
            attractionId: attraction.id,
            attractionName: attraction.name,
            attractionCity: attraction.city,
            coverImageUrl: attraction.coverImageUrl,
            dayNumber: day,
            note: "",
        }]);
        setPickerDay(null);
    };

    const removeStop = (index: number) => setStops(current => current.filter((_, i) => i !== index));

    const updateStopNote = (index: number, note: string) =>
        setStops(current => current.map((stop, i) => i === index ? {...stop, note} : stop));

    const closeDialog = () => { if (!submitting) { setError(""); onClose(); } };

    const submit = async () => {
        if (!token) {setError("请先登录后再创建线路。"); return;}
        if (!meta.title.trim()) {setError("线路标题不能为空。"); return;}
        if (stops.length === 0) {setError("请至少添加一个景点。"); return;}

        // Build ordered stops; sortOrder is the position within each day.
        const dayCounters: Record<number, number> = {};
        const payloadStops: RouteStopInput[] = stops.map(stop => {
            const order = dayCounters[stop.dayNumber] ?? 0;
            dayCounters[stop.dayNumber] = order + 1;
            return {
                attractionId: stop.attractionId,
                dayNumber: stop.dayNumber,
                sortOrder: order,
                note: stop.note.trim() || undefined,
            };
        });

        const payload: CreateTravelRoutePayload = {
            title: meta.title.trim(),
            summary: meta.summary.trim() || undefined,
            style: meta.style,
            cityId: meta.cityId.trim() || undefined,
            days: meta.days,
            peopleCount: meta.peopleCount,
            budget: meta.budget,
            imageUrls: meta.imageUrls,
            stops: payloadStops,
        };

        setSubmitting(true);
        setError("");
        try {
            if (route) {
                await ApiRequests.updateTravelRoute(token, route.id, payload);
            } else {
                await ApiRequests.createTravelRoute(token, payload);
            }
            onPublished();
            onClose();
        } catch {
            setError("发布失败，请检查内容或稍后重试。");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={closeDialog} fullWidth maxWidth="md">
            <DialogTitle>创建旅游线路</DialogTitle>
            <DialogContent dividers>
                {error && <Alert severity="error" className="mb-4">{error}</Alert>}

                <Box className="grid gap-4">
                    <TextField
                        label="线路标题"
                        value={meta.title}
                        onChange={e => setMeta({...meta, title: e.target.value})}
                        inputProps={{maxLength: 120}}
                        fullWidth required
                    />

                    <div className="grid gap-4 sm:grid-cols-2">
                        <TextField
                            label="风格"
                            select
                            value={meta.style}
                            onChange={e => setMeta({...meta, style: e.target.value as TravelStyle})}
                            fullWidth
                        >
                            {styleOptions.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                        </TextField>
                        <Autocomplete
                            options={cityOptions}
                            getOptionLabel={o => o.label}
                            isOptionEqualToValue={(o, v) => o.cityId === v.cityId}
                            value={cityOptions.find(o => o.cityId === meta.cityId) ?? null}
                            onChange={(_, value) => setMeta({...meta, cityId: value?.cityId ?? ""})}
                            renderInput={params => (
                                <TextField {...params} label="目的地城市" placeholder="请选择（可选）" fullWidth/>
                            )}
                            noOptionsText="无匹配城市"
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                        <TextField
                            label="天数"
                            type="number"
                            value={meta.days}
                            onChange={e => setMeta({...meta, days: Math.max(1, Math.min(60, Number(e.target.value) || 1))})}
                            InputProps={{inputProps: {min: 1, max: 60}}}
                            fullWidth
                        />
                        <TextField
                            label="人数"
                            type="number"
                            value={meta.peopleCount}
                            onChange={e => setMeta({...meta, peopleCount: Math.max(1, Math.min(100, Number(e.target.value) || 1))})}
                            InputProps={{inputProps: {min: 1, max: 100}}}
                            fullWidth
                        />
                        <TextField
                            label="人均预算"
                            type="number"
                            value={meta.budget}
                            onChange={e => setMeta({...meta, budget: Math.max(0, Number(e.target.value) || 0)})}
                            InputProps={{
                                inputProps: {min: 0},
                                startAdornment: <InputAdornment position="start">¥</InputAdornment>,
                            }}
                            fullWidth
                        />
                    </div>

                    <TextField
                        label="线路简介（可选）"
                        value={meta.summary}
                        onChange={e => setMeta({...meta, summary: e.target.value})}
                        multiline minRows={3} inputProps={{maxLength: 4000}}
                        fullWidth
                    />

                    <CommunityImageUploader
                        token={token}
                        value={meta.imageUrls}
                        onChange={urls => setMeta({...meta, imageUrls: urls})}
                        disabled={submitting}
                    />

                    <Divider textAlign="left" sx={{mt: 1}}>每日行程</Divider>
                    <p className="-mt-2 text-xs text-slate-500">
                        逐天添加景点，景点只能引用社区内已存在的条目（也可在选择框内即时新建）。
                    </p>

                    {dayList.map(day => {
                        const dayStops = stops
                            .map((stop, index) => ({stop, index}))
                            .filter(item => item.stop.dayNumber === day);
                        return (
                            <section key={day} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-slate-800">第 {day} 天</h4>
                                    <Button size="small" startIcon={<Add/>} onClick={() => setPickerDay(day)}>
                                        添加景点
                                    </Button>
                                </div>
                                {dayStops.length === 0 ? (
                                    <p className="rounded-md bg-white px-3 py-4 text-center text-xs text-slate-400">
                                        当天暂无景点
                                    </p>
                                ) : (
                                    <div className="grid gap-3">
                                        {dayStops.map(({stop, index}) => (
                                            <div key={index} className="flex gap-3 rounded-md border border-slate-200 bg-white p-2">
                                                <div className="h-16 w-20 shrink-0 overflow-hidden rounded bg-slate-100">
                                                    {stop.coverImageUrl
                                                        ? <img src={resolveCommunityImageUrl(stop.coverImageUrl)} alt={stop.attractionName} className="h-full w-full object-cover"/>
                                                        : <div className="flex h-full items-center justify-center text-slate-300"><Landscape/></div>
                                                    }
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p className="truncate text-sm font-semibold text-slate-900">{stop.attractionName}</p>
                                                        <IconButton size="small" onClick={() => removeStop(index)}>
                                                            <Close fontSize="small"/>
                                                        </IconButton>
                                                    </div>
                                                    {stop.attractionCity && (
                                                        <p className="flex items-center gap-1 text-xs text-slate-500">
                                                            <Place sx={{fontSize: 13}}/>{stop.attractionCity}
                                                        </p>
                                                    )}
                                                    <TextField
                                                        placeholder="行程备注（可选）"
                                                        value={stop.note}
                                                        onChange={e => updateStopNote(index, e.target.value)}
                                                        inputProps={{maxLength: 1000}}
                                                        variant="standard"
                                                        size="small"
                                                        fullWidth
                                                        sx={{mt: 0.5}}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={closeDialog} disabled={submitting}>取消</Button>
                <Button onClick={submit} variant="contained" disabled={submitting}>
                    {submitting ? "发布中…" : "发布线路"}
                </Button>
            </DialogActions>

            <AttractionPickerDialog
                open={pickerDay !== null}
                token={token}
                mode="pick"
                onPick={handlePick}
                onClose={() => setPickerDay(null)}
            />
        </Dialog>
    );
};

export default RoutePublishDialog;
