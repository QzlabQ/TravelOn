import React, {useEffect, useMemo, useState} from "react";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    InputAdornment,
    LinearProgress,
    MenuItem,
    Snackbar,
    Tab,
    Tabs,
    TextField
} from "@mui/material";
import {
    Add,
    AutoAwesome,
    Favorite,
    Forum,
    Person,
    Place,
    Search
} from "@mui/icons-material";
import {Link, useSearchParams} from "react-router-dom";
import {
    ApiRequests,
    AttractionResponse,
    CommunityCategory,
    CommunityPostResponse,
    CommunityReviewResponse,
    resolveCommunityImageUrl,
    ReviewTargetType
} from "../../core/apiConfig";
import {useAuthSession} from "../../core/useAuthSession";
import CommunityPostCard from "../components/CommunityPostCard";
import PostPublishDialog from "../components/PostPublishDialog";
import ReviewPublishDialog from "../components/ReviewPublishDialog";
import AttractionsBrowser from "../components/AttractionsBrowser";
import RoutesBrowser from "../components/RoutesBrowser";
import {travelStyleLabels} from "../components/communityLabels";

type CommunityTab = "TRAVEL_NOTE" | "ROUTE" | "SCENIC_SPOT";
type CityOption = {cityId: string, label: string};

const tabs: Array<{value: CommunityTab, label: string, reviewTargetType?: ReviewTargetType}> = [
    {value: "TRAVEL_NOTE", label: "广场"},
    {value: "ROUTE", label: "旅游线路"},
    {value: "SCENIC_SPOT", label: "景点", reviewTargetType: "SCENIC_SPOT"},
];

const isCommunityTab = (value: string | null): value is CommunityTab =>
    tabs.some(tab => tab.value === value);

const Community = () => {
    const session = useAuthSession();
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get("tab");
    const activeTab: CommunityTab = isCommunityTab(tabParam) ? tabParam : "TRAVEL_NOTE";
    const setActiveTab = (value: CommunityTab) => {
        setSearchParams(params => {
            params.set("tab", value);
            return params;
        });
    };

    const [keyword, setKeyword] = useState("");
    const [cityOptions, setCityOptions] = useState<CityOption[]>([]);
    const [selectedCity, setSelectedCity] = useState<CityOption | null>(null);
    const [sort, setSort] = useState<"latest" | "popular">("latest");
    const [posts, setPosts] = useState<CommunityPostResponse[]>([]);
    const [reviews, setReviews] = useState<CommunityReviewResponse[]>([]);
    const [topAttractions, setTopAttractions] = useState<AttractionResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [publishOpen, setPublishOpen] = useState(false);
    const [toast, setToast] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

    const selectedTab = useMemo(() => tabs.find(tab => tab.value === activeTab) ?? tabs[0], [activeTab]);
    const showPosts = activeTab === "TRAVEL_NOTE";
    const showReviews = Boolean(selectedTab.reviewTargetType);

    useEffect(() => {
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
    }, []);

    useEffect(() => {
        setLoading(true);
        setError("");

        Promise.all([
            showPosts
                ? ApiRequests.listCommunityPosts({
                    category: "TRAVEL_NOTE",
                    cityId: selectedCity?.cityId || undefined,
                    keyword: keyword.trim() || undefined,
                    sort,
                    page: 0,
                    size: 20,
                }, session?.token)
                : Promise.resolve({data: {content: [] as CommunityPostResponse[]}}),
            showReviews
                ? ApiRequests.listCommunityReviews({
                    targetType: selectedTab.reviewTargetType,
                    category: activeTab as CommunityCategory,
                    page: 0,
                    size: 20,
                }, session?.token)
                : Promise.resolve({data: {content: [] as CommunityReviewResponse[]}}),
            activeTab === "SCENIC_SPOT"
                ? ApiRequests.listAttractions({
                    sort: "latest",
                    page: 0,
                    size: 50,
                })
                : Promise.resolve({data: {content: [] as AttractionResponse[]}}),
        ])
            .then(([postsResponse, reviewsResponse, attractionsResponse]) => {
                setPosts(postsResponse.data.content);
                setReviews(reviewsResponse.data.content);
                setTopAttractions(attractionsResponse.data.content);
            })
            .catch(() => setError("社区内容暂时不可用，请确认 community-service 已启动"))
            .finally(() => setLoading(false));
    }, [activeTab, keyword, selectedCity, sort, session?.token, refreshKey, selectedTab.reviewTargetType, showPosts, showReviews]);

    const highScoreAttractions = useMemo(
        () => [...topAttractions]
            .sort((a, b) => {
                const ratingDelta = b.averageRating - a.averageRating;
                if (ratingDelta !== 0) return ratingDelta;
                const countDelta = b.reviewCount - a.reviewCount;
                if (countDelta !== 0) return countDelta;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            })
            .slice(0, 5),
        [topAttractions]
    );
    const visiblePosts = useMemo(
        () => selectedCity
            ? posts.filter(post => post.destinationCityId === selectedCity.cityId || post.destination === selectedCity.label)
            : posts,
        [posts, selectedCity]
    );
    const popularPosts = useMemo(
        () => [...visiblePosts].sort((a, b) => b.likeCount - a.likeCount).slice(0, 5),
        [visiblePosts]
    );

    const handleLike = async (post: CommunityPostResponse) => {
        if (!session) {
            setToast("请先登录后再点赞");
            return;
        }
        try {
            const response = await ApiRequests.toggleCommunityPostLike(session.token, post.id);
            setPosts(currentPosts => currentPosts.map(item => item.id === post.id ? {
                ...item,
                likedByCurrentUser: response.data.liked,
                likeCount: response.data.likeCount,
            } : item));
        } catch {
            setToast("点赞失败，请稍后重试");
        }
    };

    const openPublish = () => {
        if (!session) {
            setToast("请先登录后再发布内容");
            return;
        }
        setPublishOpen(true);
    };

    const handlePublished = () => {
        setToast("发布成功");
        setRefreshKey(value => value + 1);
    };

    return (
        <div className="min-h-screen bg-[#f6f7fb]">
            <Snackbar
                open={Boolean(toast)}
                autoHideDuration={2200}
                onClose={() => setToast("")}
                message={toast}
                anchorOrigin={{vertical: "top", horizontal: "center"}}
            />

            <section className="border-b border-slate-200 bg-white">
                <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
                    <div className="max-w-2xl">
                        <h1 className="text-4xl font-bold tracking-normal text-slate-950">旅行社区</h1>
                        <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">
                            分享行程灵感，查看目的地和线路的真实评价。
                        </p>
                    </div>
                </div>
            </section>

            <main className="mx-auto max-w-7xl px-6 py-6">
                <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <Tabs
                            value={activeTab}
                            onChange={(_, value) => setActiveTab(value)}
                            variant="scrollable"
                            scrollButtons="auto"
                        >
                            {tabs.map(tab => <Tab key={tab.value} value={tab.value} label={tab.label}/>)}
                        </Tabs>

                        <Button
                            component={Link}
                            to="/community/me"
                            variant="outlined"
                            startIcon={<Person/>}
                            sx={{whiteSpace: "nowrap"}}
                        >
                            我的
                        </Button>
                    </div>
                </section>

                {loading && <Box sx={{height: 5}} className="mt-5"><LinearProgress/></Box>}
                {error && <Alert severity="warning" className="mt-5">{error}</Alert>}

                <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="space-y-5">
                        {showPosts &&
                            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                                    <Autocomplete
                                        options={cityOptions}
                                        getOptionLabel={option => option.label}
                                        isOptionEqualToValue={(option, value) => option.cityId === value.cityId}
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
                                        placeholder="搜索帖子"
                                        value={keyword}
                                        onChange={event => setKeyword(event.target.value)}
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <Search fontSize="small"/>
                                                </InputAdornment>
                                            )
                                        }}
                                        sx={{flex: 1, minWidth: {xs: "100%", lg: 260}}}
                                    />
                                    <TextField
                                        size="small"
                                        select
                                        label="排序"
                                        value={sort}
                                        onChange={event => setSort(event.target.value as "latest" | "popular")}
                                        sx={{width: {xs: "100%", lg: 132}}}
                                    >
                                        <MenuItem value="latest">最新</MenuItem>
                                        <MenuItem value="popular">热门</MenuItem>
                                    </TextField>
                                    <Button variant="contained" startIcon={<Add/>} onClick={openPublish} sx={{whiteSpace: "nowrap"}}>
                                        发布内容
                                    </Button>
                                </div>
                            </section>
                        }

                        {showPosts && visiblePosts.length > 0 &&
                            <section className="grid gap-4">
                                <div className="flex items-center justify-between gap-3">
                                    <h2 className="text-xl font-bold text-slate-950">广场帖子</h2>
                                    <Chip size="small" label={`${visiblePosts.length} 篇`} variant="outlined"/>
                                </div>
                                {visiblePosts.map(post => (
                                    <CommunityPostCard key={`post-${post.id}`} post={post} onLike={handleLike} canLike={Boolean(session)}/>
                                ))}
                            </section>
                        }

                        {activeTab === "SCENIC_SPOT" &&
                            <AttractionsBrowser actionLabel="添加评价" emptyActionLabel="添加评价" onAction={openPublish} refreshKey={refreshKey}/>
                        }

                        {activeTab === "ROUTE" && <RoutesBrowser/>}

                        {!loading && !error && activeTab !== "SCENIC_SPOT" && activeTab !== "ROUTE" && visiblePosts.length === 0 &&
                            <section className="rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center">
                                <Forum className="text-slate-300" fontSize="large"/>
                                <p className="mt-3 font-semibold text-slate-700">当前分类暂无内容</p>
                                <p className="mt-1 text-sm text-slate-500">切换分类或发布第一条社区内容。</p>
                            </section>
                        }
                    </div>

                    <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
                        {activeTab === "TRAVEL_NOTE" && <>
                            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                                <h2 className="text-lg font-bold text-slate-950">热门分享</h2>
                                <div className="mt-3 grid gap-3">
                                    {popularPosts.map((post, index) => (
                                        <Link
                                            key={post.id}
                                            to={`/community/posts/${post.id}`}
                                            className="flex gap-3 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0"
                                        >
                                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">
                                                {index + 1}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="line-clamp-1 font-semibold text-slate-900 hover:text-blue-600">{post.title}</p>
                                                <p className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                                                    <span className="inline-flex items-center gap-1"><Favorite sx={{fontSize: 13}}/>{post.likeCount}</span>
                                                    <span className="truncate">{post.authorName}</span>
                                                </p>
                                            </div>
                                        </Link>
                                    ))}
                                    {popularPosts.length === 0 &&
                                        <p className="rounded-lg bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">还没有分享</p>
                                    }
                                </div>
                            </section>
                            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
                                    <AutoAwesome fontSize="small" className="text-blue-600"/>发布小贴士
                                </h2>
                                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
                                    <li>配上现场照片，分享更直观。</li>
                                    <li>写清目的地与行程细节，方便他人参考。</li>
                                    <li>真实体验和实用建议更受欢迎。</li>
                                </ul>
                            </section>
                        </>}

                        {activeTab === "ROUTE" && <>
                            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                                <h2 className="text-lg font-bold text-slate-950">线路玩法</h2>
                                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
                                    <li>引用社区已有景点，按天编排行程。</li>
                                    <li>标注天数、人数与人均预算。</li>
                                    <li>选择合适的风格，方便他人查找。</li>
                                </ul>
                            </section>
                            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                                <h2 className="text-lg font-bold text-slate-950">旅行风格</h2>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {Object.values(travelStyleLabels).map(label => (
                                        <Chip key={label} size="small" label={label} variant="outlined"/>
                                    ))}
                                </div>
                            </section>
                        </>}

                        {activeTab === "SCENIC_SPOT" &&
                            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                                <h2 className="text-lg font-bold text-slate-950">Top 5 高分景点</h2>
                                <div className="mt-3 grid gap-3">
                                    {highScoreAttractions.map(attraction => (
                                        <Link
                                            key={attraction.id}
                                            to={`/community/attractions/${attraction.id}`}
                                            className="flex gap-3 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0 hover:text-blue-600"
                                        >
                                            <div className="h-16 w-20 shrink-0 overflow-hidden rounded-md bg-slate-100">
                                                {attraction.coverImageUrl ? (
                                                    <img
                                                        src={resolveCommunityImageUrl(attraction.coverImageUrl)}
                                                        alt={attraction.name}
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
                                                        <Place fontSize="small"/>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-start justify-between gap-3">
                                                    <p className="min-w-0 truncate font-semibold text-slate-900">{attraction.name}</p>
                                                    <span className="shrink-0 rounded-md bg-amber-50 px-2 py-1 text-sm font-bold text-amber-700">
                                                        {attraction.averageRating.toFixed(1)}
                                                    </span>
                                                </div>
                                                <p className="mt-2 text-sm text-slate-500">
                                                    {attraction.reviewCount > 0 ? `${attraction.reviewCount} 条评价` : "暂无评价"}
                                                    {attraction.city ? ` · ${attraction.city}` : ""}
                                                </p>
                                            </div>
                                        </Link>
                                    ))}
                                    {highScoreAttractions.length === 0 &&
                                        <p className="rounded-lg bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">暂无景点评分</p>
                                    }
                                </div>
                            </section>
                        }
                    </aside>
                </div>
            </main>

            {activeTab === "SCENIC_SPOT" ? (
                <ReviewPublishDialog
                    open={publishOpen}
                    token={session?.token}
                    targetType="SCENIC_SPOT"
                    onClose={() => setPublishOpen(false)}
                    onPublished={handlePublished}
                />
            ) : (
                <PostPublishDialog
                    open={publishOpen}
                    token={session?.token}
                    onClose={() => setPublishOpen(false)}
                    onPublished={handlePublished}
                />
            )}
        </div>
    );
};

export default Community;
