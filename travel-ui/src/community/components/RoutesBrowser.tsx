import React, {useCallback, useEffect, useState} from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    InputAdornment,
    LinearProgress,
    MenuItem,
    Snackbar,
    TextField,
} from "@mui/material";
import {Add, Route as RouteIcon, Search} from "@mui/icons-material";
import {ApiRequests, TravelRouteResponse, TravelStyle} from "../../core/apiConfig";
import {useAuthSession} from "../../core/useAuthSession";
import {travelStyleLabels} from "./communityLabels";
import RouteCard from "./RouteCard";
import RoutePublishDialog from "./RoutePublishDialog";

type SortOption = "latest" | "popular";

const styleFilters: Array<{value: TravelStyle | "ALL", label: string}> = [
    {value: "ALL", label: "全部风格"},
    ...(Object.keys(travelStyleLabels) as TravelStyle[]).map(value => ({value, label: travelStyleLabels[value]})),
];

/**
 * Self-contained travel-route discovery: style filter, keyword search, sorting and
 * a responsive card grid. Rendered inline in the community "旅游线路" tab.
 */
const RoutesBrowser = () => {
    const session = useAuthSession();
    const [keyword, setKeyword] = useState("");
    const [debouncedKeyword, setDebouncedKeyword] = useState("");
    const [style, setStyle] = useState<TravelStyle | "ALL">("ALL");
    const [sort, setSort] = useState<SortOption>("latest");
    const [routes, setRoutes] = useState<TravelRouteResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [publishOpen, setPublishOpen] = useState(false);
    const [toast, setToast] = useState("");

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedKeyword(keyword.trim()), 300);
        return () => clearTimeout(timer);
    }, [keyword]);

    const load = useCallback(() => {
        setLoading(true);
        setError("");
        ApiRequests.listTravelRoutes({
            style: style === "ALL" ? undefined : style,
            keyword: debouncedKeyword || undefined,
            sort,
            page: 0,
            size: 24,
        })
            .then(res => setRoutes(res.data.content))
            .catch(() => setError("线路列表暂时不可用，请确认 community-service 已启动。"))
            .finally(() => setLoading(false));
    }, [style, debouncedKeyword, sort]);

    useEffect(() => { load(); }, [load]);

    const openPublish = () => {
        if (!session) {setToast("请先登录后再创建线路。"); return;}
        setPublishOpen(true);
    };

    const emptyHint = debouncedKeyword || style !== "ALL"
        ? "没有匹配的线路，换个筛选条件试试。"
        : "成为第一个分享旅游线路的人吧！";

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
                    <TextField
                        size="small"
                        select
                        label="风格"
                        value={style}
                        onChange={e => setStyle(e.target.value as TravelStyle | "ALL")}
                        sx={{minWidth: {xs: "100%", lg: 160}}}
                    >
                        {styleFilters.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                    </TextField>
                    <TextField
                        size="small"
                        placeholder="按线路标题或简介搜索"
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
                        <MenuItem value="latest">最新</MenuItem>
                        <MenuItem value="popular">最热门</MenuItem>
                    </TextField>
                    <Button variant="contained" startIcon={<Add/>} onClick={openPublish} sx={{whiteSpace: "nowrap"}}>
                        创建线路
                    </Button>
                </div>
            </section>

            <div className="mb-4 mt-5 flex items-center gap-2">
                <RouteIcon className="text-blue-600" fontSize="small"/>
                <h2 className="text-xl font-bold text-slate-950">旅游线路</h2>
                {!loading && !error && <Chip size="small" label={`${routes.length} 条`} variant="outlined"/>}
            </div>

            {loading && <Box sx={{mb: 4}}><LinearProgress/></Box>}
            {error && <Alert severity="warning" sx={{mb: 4}}>{error}</Alert>}

            {!loading && !error && routes.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white py-20 text-center">
                    <RouteIcon className="text-slate-300" fontSize="large"/>
                    <p className="mt-3 font-semibold text-slate-700">暂无线路</p>
                    <p className="mt-1 text-sm text-slate-500">{emptyHint}</p>
                    <Button variant="contained" startIcon={<Add/>} onClick={openPublish} sx={{mt: 3}}>
                        创建线路
                    </Button>
                </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {routes.map(route => <RouteCard key={route.id} route={route}/>)}
            </div>

            <RoutePublishDialog
                open={publishOpen}
                token={session?.token}
                onClose={() => setPublishOpen(false)}
                onPublished={() => {
                    setToast("线路发布成功。");
                    load();
                }}
            />
        </div>
    );
};

export default RoutesBrowser;
