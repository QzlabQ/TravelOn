import React, {useEffect, useMemo, useState} from "react";
import axios from "axios";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    InputAdornment,
    List,
    ListItemButton,
    ListItemText,
    TextField
} from "@mui/material";
import {Landscape, Link as LinkIcon, Route as RouteIcon, Search} from "@mui/icons-material";
import {
    ApiRequests,
    AttractionResponse,
    CreateCommunityPostPayload,
    ReviewTargetType,
    TravelRouteResponse
} from "../../core/apiConfig";
import CommunityImageUploader from "./CommunityImageUploader";

type Props = {
    open: boolean,
    token?: string,
    onClose: () => void,
    onPublished: () => void,
};

type CityOption = {cityId: string, label: string};
type AssociationType = "SCENIC_SPOT" | "ROUTE";
type AssociationOption = {id: string, label: string, meta?: string, cityId?: string | null, cityLabel?: string | null};

const defaultPayload: CreateCommunityPostPayload = {
    title: "",
    content: "",
    category: "TRAVEL_NOTE",
    destinationCityId: "",
    imageUrls: [],
};

const PostPublishDialog = ({open, token, onClose, onPublished}: Props) => {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [payload, setPayload] = useState<CreateCommunityPostPayload>(defaultPayload);
    const [cityOptions, setCityOptions] = useState<CityOption[]>([]);
    const [pickerType, setPickerType] = useState<AssociationType | null>(null);
    // When a route/attraction is associated, its city fixes the post's city (issue #9).
    const [lockedCityLabel, setLockedCityLabel] = useState<string | null>(null);

    const associatedType = payload.associatedTargetType;
    const associatedName = payload.associatedTargetName;

    useEffect(() => {
        if (!open || cityOptions.length > 0) return;
        ApiRequests.getHotelDestinations()
            .then(res => {
                const seen = new Set<string>();
                const options = res.data
                    .filter(destination => destination.cityId && destination.region)
                    .filter(destination => {
                        if (seen.has(destination.cityId)) return false;
                        seen.add(destination.cityId);
                        return true;
                    })
                    .map(destination => ({cityId: destination.cityId, label: destination.region}))
                    .sort((a, b) => a.label.localeCompare(b.label, "zh"));
                setCityOptions(options);
            })
            .catch(() => {});
    }, [open, cityOptions.length]);

    const closeDialog = () => {
        if (!submitting) {
            setError("");
            onClose();
        }
    };

    const setAssociation = (type: AssociationType, option: AssociationOption) => {
        setPayload(current => ({
            ...current,
            associatedTargetType: type,
            associatedTargetId: option.id,
            associatedTargetName: option.label,
            // The associated route/attraction's city becomes the post's city.
            destinationCityId: option.cityId ?? current.destinationCityId,
        }));
        setLockedCityLabel(option.cityId ? (option.cityLabel ?? null) : null);
        setPickerType(null);
    };

    const clearAssociation = () => {
        setPayload(current => ({
            ...current,
            associatedTargetType: undefined,
            associatedTargetId: undefined,
            associatedTargetName: undefined,
        }));
        setLockedCityLabel(null);
    };

    const submit = async () => {
        if (!token) {
            setError("请先登录后再发布内容。");
            return;
        }
        if (!payload.title.trim() || !payload.content.trim()) {
            setError("标题和正文不能为空。");
            return;
        }

        setSubmitting(true);
        setError("");
        try {
            await ApiRequests.createCommunityPost(token, {
                title: payload.title.trim(),
                content: payload.content.trim(),
                category: "TRAVEL_NOTE",
                destinationCityId: payload.destinationCityId?.trim() || undefined,
                associatedTargetType: payload.associatedTargetType,
                associatedTargetId: payload.associatedTargetId,
                associatedTargetName: payload.associatedTargetName,
                imageUrls: payload.imageUrls ?? [],
            });
            setPayload(defaultPayload);
            setLockedCityLabel(null);
            onPublished();
            onClose();
        } catch (e) {
            if (axios.isAxiosError(e)) {
                const status = e.response?.status;
                if (status === 401) {
                    setError("登录状态已失效，请重新登录后再发布。");
                } else if (status === 400) {
                    setError("发布失败，请检查标题、正文和图片内容。");
                } else {
                    setError(`发布失败（${status ?? "网络错误"}），请稍后重试。`);
                }
            } else {
                setError("发布失败，请稍后重试。");
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <Dialog open={open} onClose={closeDialog} fullWidth maxWidth="md">
                <DialogTitle>发布到广场</DialogTitle>
                <DialogContent dividers>
                    {error && <Alert severity="error" className="mb-4">{error}</Alert>}
                    <Box className="grid gap-4">
                        <TextField
                            label="标题"
                            value={payload.title}
                            onChange={event => setPayload({...payload, title: event.target.value})}
                            inputProps={{maxLength: 120}}
                            fullWidth
                            required
                        />
                        {lockedCityLabel ? (
                            <TextField
                                label="城市"
                                value={lockedCityLabel}
                                disabled
                                fullWidth
                                helperText="已根据关联的线路 / 景点自动设置城市"
                            />
                        ) : (
                            <Autocomplete
                                options={cityOptions}
                                getOptionLabel={option => option.label}
                                isOptionEqualToValue={(option, value) => option.cityId === value.cityId}
                                value={cityOptions.find(option => option.cityId === payload.destinationCityId) ?? null}
                                onChange={(_, value) => setPayload({...payload, destinationCityId: value?.cityId ?? ""})}
                                renderInput={params => (
                                    <TextField
                                        {...params}
                                        label="城市（可选）"
                                        placeholder="选择帖子相关城市"
                                        fullWidth
                                    />
                                )}
                                noOptionsText="无匹配城市"
                            />
                        )}

                        <section className="rounded-lg border border-slate-200 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-800">关联内容（可选）</p>
                                    {associatedType && associatedName ? (
                                        <Chip
                                            className="mt-2 max-w-full"
                                            icon={associatedType === "ROUTE" ? <RouteIcon/> : <Landscape/>}
                                            label={`${associatedType === "ROUTE" ? "线路" : "景点"}：${associatedName}`}
                                            onDelete={clearAssociation}
                                            sx={{"& .MuiChip-label": {overflow: "hidden", textOverflow: "ellipsis"}}}
                                        />
                                    ) : (
                                        <p className="mt-1 text-sm text-slate-500">可关联一个景点或一条旅游线路。</p>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="outlined" startIcon={<Landscape/>} onClick={() => setPickerType("SCENIC_SPOT")}>
                                        选择景点
                                    </Button>
                                    <Button variant="outlined" startIcon={<RouteIcon/>} onClick={() => setPickerType("ROUTE")}>
                                        选择线路
                                    </Button>
                                </div>
                            </div>
                        </section>

                        <TextField
                            label="正文"
                            value={payload.content}
                            onChange={event => setPayload({...payload, content: event.target.value})}
                            multiline
                            minRows={6}
                            inputProps={{maxLength: 4000}}
                            fullWidth
                            required
                        />
                        <CommunityImageUploader
                            token={token}
                            value={payload.imageUrls ?? []}
                            onChange={urls => setPayload({...payload, imageUrls: urls})}
                            disabled={submitting}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDialog} disabled={submitting}>取消</Button>
                    <Button onClick={submit} variant="contained" disabled={submitting}>
                        {submitting ? "发布中" : "发布"}
                    </Button>
                </DialogActions>
            </Dialog>

            <AssociationPickerDialog
                open={Boolean(pickerType)}
                type={pickerType}
                onPick={setAssociation}
                onClose={() => setPickerType(null)}
            />
        </>
    );
};

type AssociationPickerProps = {
    open: boolean,
    type: AssociationType | null,
    onPick: (type: AssociationType, option: AssociationOption) => void,
    onClose: () => void,
};

const AssociationPickerDialog = ({open, type, onPick, onClose}: AssociationPickerProps) => {
    const [keyword, setKeyword] = useState("");
    const [loading, setLoading] = useState(false);
    const [options, setOptions] = useState<AssociationOption[]>([]);

    const title = type === "ROUTE" ? "选择关联线路" : "选择关联景点";
    const placeholder = type === "ROUTE" ? "搜索线路标题或简介" : "搜索景点名称或城市";

    useEffect(() => {
        if (!open || !type) return;
        const timer = setTimeout(() => {
            setLoading(true);
            const request = type === "ROUTE"
                ? ApiRequests.listTravelRoutes({keyword: keyword.trim() || undefined, sort: "latest", page: 0, size: 20})
                : ApiRequests.listAttractions({keyword: keyword.trim() || undefined, sort: "reviewCount", page: 0, size: 20});

            request
                .then(response => {
                    if (type === "ROUTE") {
                        setOptions((response.data.content as TravelRouteResponse[]).map(route => ({
                            id: route.id,
                            label: route.title,
                            cityId: route.cityId,
                            cityLabel: route.city,
                            meta: [
                                route.city,
                                `${route.days} 天`,
                                route.reviewCount > 0 ? `${route.averageRating.toFixed(1)} 分` : "暂无评分",
                            ].filter(Boolean).join(" · "),
                        })));
                    } else {
                        setOptions((response.data.content as AttractionResponse[]).map(attraction => ({
                            id: attraction.id,
                            label: attraction.name,
                            cityId: attraction.cityId,
                            cityLabel: attraction.city,
                            meta: [
                                attraction.city,
                                attraction.reviewCount > 0 ? `${attraction.averageRating.toFixed(1)} 分` : "暂无评价",
                            ].filter(Boolean).join(" · "),
                        })));
                    }
                })
                .catch(() => setOptions([]))
                .finally(() => setLoading(false));
        }, 250);
        return () => clearTimeout(timer);
    }, [keyword, open, type]);

    const emptyText = useMemo(() => {
        if (loading) return "加载中";
        return keyword.trim() ? "没有匹配结果" : "暂无可选内容";
    }, [keyword, loading]);

    const handleClose = () => {
        setKeyword("");
        setOptions([]);
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
            <DialogTitle>{title}</DialogTitle>
            <DialogContent dividers>
                <TextField
                    fullWidth
                    size="small"
                    placeholder={placeholder}
                    value={keyword}
                    onChange={event => setKeyword(event.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                {loading ? <CircularProgress size={16}/> : <Search fontSize="small"/>}
                            </InputAdornment>
                        )
                    }}
                    sx={{mb: 2}}
                />
                {options.length > 0 ? (
                    <List dense disablePadding>
                        {options.map(option => (
                            <ListItemButton
                                key={option.id}
                                onClick={() => type && onPick(type, option)}
                                sx={{borderRadius: 1}}
                            >
                                <ListItemText
                                    primary={<span className="font-semibold">{option.label}</span>}
                                    secondary={option.meta}
                                />
                            </ListItemButton>
                        ))}
                    </List>
                ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
                        <LinkIcon className="mb-2 text-slate-300"/>
                        <p>{emptyText}</p>
                    </div>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>取消</Button>
            </DialogActions>
        </Dialog>
    );
};

export default PostPublishDialog;
