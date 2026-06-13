import React, {useEffect, useState} from "react";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    InputAdornment,
    List,
    ListItemButton,
    ListItemText,
    Rating,
    TextField,
    Typography,
} from "@mui/material";
import {Add, ArrowBack, Landscape, Search} from "@mui/icons-material";
import axios from "axios";
import {ApiRequests, AttractionResponse, CreateAttractionPayload} from "../../core/apiConfig";
import CommunityImageUploader from "./CommunityImageUploader";

type Props = {
    open: boolean,
    token?: string,
    onPick: (attraction: AttractionResponse) => void,
    onClose: () => void,
    /**
     * "pick" (default) lets the user search and select an existing attraction,
     * with a fallback to create a new one — used when picking a review target.
     * "create" opens straight into the new-attraction form with no selection UI —
     * used by the "添加景点" action.
     */
    mode?: "pick" | "create",
    /**
     * When set, restricts both search and creation to this city. Used by route
     * publishing so every stop belongs to the route's city (issue #7).
     */
    lockedCityId?: string | null,
    lockedCityLabel?: string | null,
};

const emptyCreate: CreateAttractionPayload = {name: "", cityId: "", description: "", imageUrls: []};

const AttractionPickerDialog = ({open, token, onPick, onClose, mode = "pick", lockedCityId, lockedCityLabel}: Props) => {
    const createOnly = mode === "create";
    const [keyword, setKeyword] = useState("");
    const [results, setResults] = useState<AttractionResponse[]>([]);
    const [searching, setSearching] = useState(false);
    const [showCreate, setShowCreate] = useState(createOnly);
    const [createPayload, setCreatePayload] = useState<CreateAttractionPayload>(emptyCreate);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");


    // {cityId: code, label: 城市名} 选项列表
    const [cityOptions, setCityOptions] = useState<{cityId: string, label: string}[]>([]);

    // 打开时重置到对应模式的初始状态
    useEffect(() => {
        if (!open) return;
        setShowCreate(createOnly);
        setError("");
        if (createOnly) {
            setCreatePayload({...emptyCreate, cityId: lockedCityId ?? ""});
            setKeyword("");
        }
    }, [open, createOnly, lockedCityId]);

    // 打开时加载城市列表
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

    // 防抖搜索（仅在选择模式且未展开新建表单时进行）
    useEffect(() => {
        if (!open || showCreate) return;
        const timer = setTimeout(() => {
            setSearching(true);
            ApiRequests.listAttractions({keyword: keyword.trim() || undefined, cityId: lockedCityId || undefined, page: 0, size: 10})
                .then(res => setResults(res.data.content))
                .catch(() => setResults([]))
                .finally(() => setSearching(false));
        }, 300);
        return () => clearTimeout(timer);
    }, [keyword, open, showCreate, lockedCityId]);

    const handleClose = () => {
        setKeyword("");
        setShowCreate(createOnly);
        setCreatePayload({...emptyCreate, cityId: lockedCityId ?? ""});
        setError("");
        onClose();
    };

    const handleCreate = async () => {
        if (!token) {setError("请先登录。"); return;}
        if (!createPayload.name.trim()) {setError("景点名称不能为空。"); return;}
        setCreating(true);
        setError("");
        try {
            const res = await ApiRequests.createAttraction(token, {
                ...createPayload,
                name: createPayload.name.trim(),
                cityId: createPayload.cityId?.trim() || undefined,
                description: createPayload.description?.trim() || undefined,
                imageUrls: createPayload.imageUrls ?? [],
            });
            onPick(res.data);
            handleClose();
        } catch (e: unknown) {
            console.error("[AttractionPickerDialog] createAttraction failed:", e);
            if (axios.isAxiosError(e)) {
                const status = e.response?.status;
                if (status === 401) {
                    setError("登录已失效，请退出后重新登录再试。");
                } else if (status === 503) {
                    setError("用户服务暂时不可用，请稍后重试。");
                } else if (!e.response) {
                    setError("无法连接到服务器，请确认后端服务已启动。");
                } else {
                    setError(`添加失败（${status ?? "未知错误"}），请稍后重试。`);
                }
            } else {
                setError("添加景点失败，请稍后重试。");
            }
        } finally {
            setCreating(false);
        }
    };

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
            <DialogTitle>{showCreate ? "新建景点" : "选择景点"}</DialogTitle>
            <DialogContent dividers>
                {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}

                {/* 选择模式：搜索 + 结果列表 + “新建景点”入口 */}
                {!showCreate && (
                    <>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="搜索景点名称或城市…"
                            value={keyword}
                            onChange={e => setKeyword(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        {searching ? <CircularProgress size={16}/> : <Search fontSize="small"/>}
                                    </InputAdornment>
                                )
                            }}
                            sx={{mb: 1}}
                        />

                        {results.length > 0 && (
                            <List dense disablePadding>
                                {results.map(a => (
                                    <ListItemButton key={a.id} onClick={() => { onPick(a); handleClose(); }}>
                                        <ListItemText
                                            primary={<span className="font-semibold">{a.name}</span>}
                                            secondary={
                                                <span className="flex items-center gap-2 text-xs text-slate-500">
                                                    {a.city && <span>{a.city}</span>}
                                                    <Rating value={a.averageRating} readOnly size="small" precision={0.1}/>
                                                    <span>{a.reviewCount > 0 ? `${a.reviewCount} 条评价` : "暂无评价"}</span>
                                                </span>
                                            }
                                        />
                                    </ListItemButton>
                                ))}
                            </List>
                        )}

                        {!searching && results.length === 0 && keyword.trim() && (
                            <Typography variant="body2" color="text.secondary" align="center" sx={{py: 2}}>
                                未找到匹配景点
                            </Typography>
                        )}

                        <Divider sx={{my: 2}}/>

                        <Button
                            startIcon={<Add/>}
                            variant="outlined"
                            fullWidth
                            onClick={() => {
                                setShowCreate(true);
                                setCreatePayload({...emptyCreate, name: keyword.trim()});
                            }}
                        >
                            没有找到？新建景点
                        </Button>
                    </>
                )}

                {/* 新建模式：仅显示新建表单，不再显示选择部分 */}
                {showCreate && (
                    <Box>
                        <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-slate-700">
                                <Landscape fontSize="small"/>
                                <Typography variant="subtitle2" fontWeight={700}>新建景点</Typography>
                            </div>
                            {!createOnly && (
                                <Button size="small" startIcon={<ArrowBack/>} onClick={() => setShowCreate(false)}>
                                    返回选择
                                </Button>
                            )}
                        </div>
                        <Box className="grid gap-3">
                            <TextField
                                label="景点名称"
                                value={createPayload.name}
                                onChange={e => setCreatePayload({...createPayload, name: e.target.value})}
                                inputProps={{maxLength: 120}}
                                fullWidth required size="small"
                                autoFocus
                            />
                            {lockedCityId ? (
                                <TextField
                                    label="城市"
                                    size="small"
                                    fullWidth
                                    disabled
                                    value={lockedCityLabel ?? (cityOptions.find(o => o.cityId === lockedCityId)?.label ?? lockedCityId)}
                                    helperText="景点城市需与线路城市一致"
                                />
                            ) : (
                                <Autocomplete
                                    options={cityOptions}
                                    getOptionLabel={o => o.label}
                                    isOptionEqualToValue={(o, v) => o.cityId === v.cityId}
                                    value={cityOptions.find(o => o.cityId === createPayload.cityId) ?? null}
                                    onChange={(_, value) => setCreatePayload({...createPayload, cityId: value?.cityId ?? ""})}
                                    renderInput={params => (
                                        <TextField
                                            {...params}
                                            label="城市"
                                            size="small"
                                            fullWidth
                                            placeholder="请选择城市"
                                        />
                                    )}
                                    noOptionsText="无匹配城市"
                                    size="small"
                                />
                            )}
                            <TextField
                                label="简介（可选）"
                                value={createPayload.description}
                                onChange={e => setCreatePayload({...createPayload, description: e.target.value})}
                                multiline minRows={2} inputProps={{maxLength: 2000}}
                                fullWidth size="small"
                            />
                            <CommunityImageUploader
                                token={token}
                                value={createPayload.imageUrls ?? []}
                                onChange={urls => setCreatePayload({...createPayload, imageUrls: urls})}
                                disabled={creating}
                            />
                        </Box>
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} disabled={creating}>取消</Button>
                {showCreate && (
                    <Button variant="contained" onClick={handleCreate} disabled={creating}>
                        {creating ? "添加中…" : createOnly ? "添加景点" : "添加并选中"}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default AttractionPickerDialog;
