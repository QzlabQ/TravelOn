import React, {useEffect, useMemo, useState} from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    InputAdornment,
    LinearProgress,
    MenuItem,
    Rating,
    Snackbar,
    Tab,
    Tabs,
    TextField
} from "@mui/material";
import {
    Add,
    AutoAwesome,
    Favorite,
    FavoriteBorder,
    Forum,
    Person,
    Place,
    Search
} from "@mui/icons-material";
import {Link, useSearchParams} from "react-router-dom";
import {
    ApiRequests,
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
import {categoryLabels, formatCommunityTime, targetTypeLabels, travelStyleLabels} from "../components/communityLabels";

type CommunityTab = "TRAVEL_NOTE" | "ROUTE" | "SCENIC_SPOT";

const tabs: Array<{value: CommunityTab, label: string, reviewTargetType?: ReviewTargetType}> = [
    {value: "TRAVEL_NOTE", label: "广场"},
    {value: "ROUTE", label: "旅游线路"},
    {value: "SCENIC_SPOT", label: "景点评价", reviewTargetType: "SCENIC_SPOT"},
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
    const [sort, setSort] = useState<"latest" | "popular">("latest");
    const [posts, setPosts] = useState<CommunityPostResponse[]>([]);
    const [reviews, setReviews] = useState<CommunityReviewResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [publishOpen, setPublishOpen] = useState(false);
    const [toast, setToast] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

    const selectedTab = useMemo(() => tabs.find(tab => tab.value === activeTab) ?? tabs[0], [activeTab]);
    const showPosts = activeTab === "TRAVEL_NOTE";
    const showReviews = Boolean(selectedTab.reviewTargetType);

    useEffect(() => {
        setLoading(true);
        setError("");

        Promise.all([
            showPosts
                ? ApiRequests.listCommunityPosts({
                    category: "TRAVEL_NOTE",
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
        ])
            .then(([postsResponse, reviewsResponse]) => {
                setPosts(postsResponse.data.content);
                setReviews(reviewsResponse.data.content);
            })
            .catch(() => setError("社区内容暂时不可用，请确认 community-service 已启动"))
            .finally(() => setLoading(false));
    }, [activeTab, keyword, sort, session?.token, refreshKey, selectedTab.reviewTargetType, showPosts, showReviews]);

    const featuredPost = useMemo(() => posts[0], [posts]);
    const feedPosts = useMemo(
        () => featuredPost ? posts.filter(post => post.id !== featuredPost.id) : posts,
        [featuredPost, posts]
    );
    const recentReviews = useMemo(() => reviews.slice(0, 4), [reviews]);
    const popularPosts = useMemo(
        () => [...posts].sort((a, b) => b.likeCount - a.likeCount).slice(0, 5),
        [posts]
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

                        {showPosts && featuredPost &&
                            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                                <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_320px]">
                                    <div className="p-6">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Chip size="small" icon={<AutoAwesome/>} label="精选分享" color="primary"/>
                                            {featuredPost.destination &&
                                                <Chip size="small" icon={<Place/>} label={featuredPost.destination}/>
                                            }
                                        </div>
                                        <Link to={`/community/posts/${featuredPost.id}`} className="mt-4 block">
                                            <h2 className="line-clamp-2 text-2xl font-bold leading-8 text-slate-950 hover:text-blue-600">
                                                {featuredPost.title}
                                            </h2>
                                        </Link>
                                        <p className="mt-3 line-clamp-4 text-sm leading-7 text-slate-600">{featuredPost.content}</p>
                                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                                            <p className="text-sm text-slate-500">
                                                {featuredPost.authorName} · {formatCommunityTime(featuredPost.createdAt)}
                                            </p>
                                            <Button
                                                size="small"
                                                variant={featuredPost.likedByCurrentUser ? "contained" : "outlined"}
                                                color={featuredPost.likedByCurrentUser ? "error" : "primary"}
                                                startIcon={featuredPost.likedByCurrentUser ? <Favorite/> : <FavoriteBorder/>}
                                                onClick={() => handleLike(featuredPost)}
                                            >
                                                {featuredPost.likeCount}
                                            </Button>
                                        </div>
                                    </div>
                                    <Link to={`/community/posts/${featuredPost.id}`} className="h-60 bg-slate-100 md:h-auto">
                                        {featuredPost.imageUrls?.[0] ?
                                            <img src={resolveCommunityImageUrl(featuredPost.imageUrls[0])} alt={featuredPost.title} className="h-full w-full object-cover"/>
                                            :
                                            <div className="flex h-full items-center justify-center text-slate-400">
                                                <Forum fontSize="large"/>
                                            </div>
                                        }
                                    </Link>
                                </div>
                            </section>
                        }

                        {showPosts && feedPosts.length > 0 &&
                            <section className="grid gap-4">
                                <div className="flex items-center justify-between gap-3">
                                    <h2 className="text-xl font-bold text-slate-950">社区帖子</h2>
                                    <Chip size="small" label={`${feedPosts.length} 篇`} variant="outlined"/>
                                </div>
                                {feedPosts.map(post => (
                                    <CommunityPostCard key={`post-${post.id}`} post={post} onLike={handleLike} canLike={Boolean(session)}/>
                                ))}
                            </section>
                        }

                        {activeTab === "SCENIC_SPOT" &&
                            <AttractionsBrowser actionLabel="添加评价" emptyActionLabel="添加评价" onAction={openPublish}/>
                        }

                        {activeTab === "ROUTE" && <RoutesBrowser/>}

                        {!loading && !error && activeTab !== "SCENIC_SPOT" && activeTab !== "ROUTE" && posts.length === 0 &&
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
                                <h2 className="text-lg font-bold text-slate-950">最新评价</h2>
                                <div className="mt-3 grid gap-3">
                                    {recentReviews.map(review => (
                                        <div key={review.id} className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="truncate font-semibold text-slate-900">{review.targetName}</p>
                                                <span className="text-xs text-slate-400">{formatCommunityTime(review.createdAt)}</span>
                                            </div>
                                            <div className="mt-1 flex items-center gap-2">
                                                <Rating value={review.rating} readOnly size="small"/>
                                                <span className="text-xs text-slate-500">{targetTypeLabels[review.targetType]}</span>
                                            </div>
                                            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{review.content}</p>
                                        </div>
                                    ))}
                                    {recentReviews.length === 0 &&
                                        <p className="rounded-lg bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">暂无评价</p>
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
