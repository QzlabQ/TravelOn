import React, {useCallback, useEffect, useMemo, useState} from "react";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    InputAdornment,
    LinearProgress,
    MenuItem,
    Rating,
    Snackbar,
    TextField,
} from "@mui/material";
import {Add, Landscape, Place, Search, TrendingUp} from "@mui/icons-material";
import {Link} from "react-router-dom";
import {ApiRequests, AttractionResponse, resolveCommunityImageUrl} from "../../core/apiConfig";
import {useAuthSession} from "../../core/useAuthSession";
import AttractionPickerDialog from "./AttractionPickerDialog";

type CityOption = {cityId: string, label: string};
type SortOption = "popular" | "latest";

type Props = {
    actionLabel?: string,
    emptyActionLabel?: string,
    onAction?: () => void,
};

const AttractionsBrowser = ({actionLabel, emptyActionLabel, onAction}: Props) => {
    const session = useAuthSession();
    const [keyword, setKeyword] = useState("");
    const [debouncedKeyword, setDebouncedKeyword] = useState("");
    const [cityOptions, setCityOptions] = useState<CityOption[]>([]);
    const [selectedCity, setSelectedCity] = useState<CityOption | null>(null);
    const [sort, setSort] = useState<SortOption>("popular");
    const [attractions, setAttractions] = useState<AttractionResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [pickerOpen, setPickerOpen] = useState(false);
    const [toast, setToast] = useState("");

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedKeyword(keyword.trim()), 300);
        return () => clearTimeout(timer);
    }, [keyword]);

    useEffect(() => {
        ApiRequests.getHotelDestinations()
            .then(res => {
                const seen = new Set<string>();
                const opts = res.data
                    .filter(d => d.cityId && d.region)
                    .filter(d => {
                        if (seen.has(d.cityId)) return false;
                        seen.add(d.cityId);
                        return true;
                    })
                    .map(d => ({cityId: d.cityId, label: d.region}))
                    .sort((a, b) => a.label.localeCompare(b.label, "zh"));
                setCityOptions(opts);
            })
            .catch(() => {});
    }, []);

    const load = useCallback(() => {
        setLoading(true);
        setError("");
        ApiRequests.listAttractions({
            cityId: selectedCity?.cityId || undefined,
            keyword: debouncedKeyword || undefined,
            sort,
            page: 0,
            size: 24,
        })
            .then(res => setAttractions(res.data.content))
            .catch(() => setError("景点列表暂时不可用，请确认 community-service 已启动"))
            .finally(() => setLoading(false));
    }, [selectedCity, debouncedKeyword, sort]);

    useEffect(() => { load(); }, [load]);

    const openPicker = () => {
        if (!session) {
            setToast("请先登录后再添加景点");
            return;
        }
        setPickerOpen(true);
    };

    const handlePick = (attraction: AttractionResponse) => {
        setToast(`景点「${attraction.name}」已添加`);
        load();
    };

    const primaryAction = onAction ?? openPicker;
    const primaryLabel = actionLabel ?? "添加景点";

    const listHeading = useMemo(() => {
        const scope = selectedCity ? selectedCity.label : "全部城市";
        return sort === "popular" ? `${scope} · 热门景点` : `${scope} · 最新景点`;
    }, [selectedCity, sort]);

    const emptyHint = debouncedKeyword
        ? "没有匹配的景点，换个关键词试试。"
        : selectedCity
            ? "该城市还没有景点。"
            : "当前还没有景点。";

    return (
        <div>
            <Snackbar
                open={Boolean(toast)}
                autoHideDuration={2500}
                onClose={() => setToast("")}
                message={toast}
                anchorOrigin={{vertical: "top", horizontal: "center"}}
            />

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <Autocomplete
                        options={cityOptions}
                        getOptionLabel={o => o.label}
                        isOptionEqualToValue={(o, v) => o.cityId === v.cityId}
                        value={selectedCity}
                        onChange={(_, value) => setSelectedCity(value)}
                        renderInput={params => (
                            <TextField
                                {...params}
                                size="small"
                                label="城市"
                                placeholder="全部城市"
                                InputProps={{
                                    ...params.InputProps,
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <Place fontSize="small"/>
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        )}
                        noOptionsText="无匹配城市"
                        sx={{minWidth: {xs: "100%", lg: 220}}}
                    />
                    <TextField
                        size="small"
                        placeholder="按景点名称或描述搜索"
                        value={keyword}
                        onChange={e => setKeyword(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Search fontSize="small"/>
                                </InputAdornment>
                            )
                        }}
                        sx={{flex: 1, minWidth: {xs: "100%", lg: 240}}}
                    />
                    <TextField
                        size="small"
                        select
                        label="排序"
                        value={sort}
                        onChange={e => setSort(e.target.value as SortOption)}
                        sx={{width: {xs: "100%", lg: 132}}}
                    >
                        <MenuItem value="popular">最热门</MenuItem>
                        <MenuItem value="latest">最新</MenuItem>
                    </TextField>
                    <Button variant="contained" startIcon={<Add/>} onClick={primaryAction} sx={{whiteSpace: "nowrap"}}>
                        {primaryLabel}
                    </Button>
                </div>
            </section>

            <div className="mb-4 mt-5 flex items-center gap-2">
                {sort === "popular" && <TrendingUp className="text-blue-600" fontSize="small"/>}
                <h2 className="text-xl font-bold text-slate-950">{listHeading}</h2>
                {!loading && !error && (
                    <Chip size="small" label={`${attractions.length} 个`} variant="outlined"/>
                )}
            </div>

            {loading && <Box sx={{mb: 4}}><LinearProgress/></Box>}
            {error && <Alert severity="warning" sx={{mb: 4}}>{error}</Alert>}

            {!loading && !error && attractions.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white py-20 text-center">
                    <Landscape className="text-slate-300" fontSize="large"/>
                    <p className="mt-3 font-semibold text-slate-700">暂无景点</p>
                    <p className="mt-1 text-sm text-slate-500">{emptyHint}</p>
                    <Button variant="contained" startIcon={<Add/>} onClick={primaryAction} sx={{mt: 3}}>
                        {emptyActionLabel ?? primaryLabel}
                    </Button>
                </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {attractions.map((attraction, index) => (
                    <Link key={attraction.id} to={`/community/attractions/${attraction.id}`} className="group block">
                        <article className="relative h-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition group-hover:border-blue-300 group-hover:shadow-md">
                            {sort === "popular" && index < 3 && attraction.reviewCount > 0 && (
                                <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-amber-500/95 px-2 py-0.5 text-xs font-bold text-white shadow">
                                    <TrendingUp fontSize="inherit"/>热门 #{index + 1}
                                </span>
                            )}
                            <div className="h-44 overflow-hidden bg-slate-100">
                                {attraction.coverImageUrl
                                    ? <img src={resolveCommunityImageUrl(attraction.coverImageUrl)} alt={attraction.name} className="h-full w-full object-cover transition group-hover:scale-105"/>
                                    : <div className="flex h-full items-center justify-center text-slate-400"><Landscape fontSize="large"/></div>
                                }
                            </div>
                            <div className="p-4">
                                <h3 className="line-clamp-1 font-bold text-slate-950 group-hover:text-blue-600">{attraction.name}</h3>
                                {attraction.city && (
                                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                                        <Place fontSize="inherit"/>{attraction.city}
                                    </p>
                                )}
                                <div className="mt-2 flex items-center gap-2">
                                    <Rating value={attraction.averageRating} readOnly size="small" precision={0.1}/>
                                    <span className="text-xs text-slate-500">
                                        {attraction.reviewCount > 0
                                            ? `${attraction.averageRating.toFixed(1)} (${attraction.reviewCount} 条)`
                                            : "暂无评价"
                                        }
                                    </span>
                                </div>
                                {attraction.description && (
                                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{attraction.description}</p>
                                )}
                            </div>
                        </article>
                    </Link>
                ))}
            </div>

            {!onAction && (
                <AttractionPickerDialog
                    open={pickerOpen}
                    token={session?.token}
                    mode="create"
                    onPick={handlePick}
                    onClose={() => setPickerOpen(false)}
                />
            )}
        </div>
    );
};

export default AttractionsBrowser;
