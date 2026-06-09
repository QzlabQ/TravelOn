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
    Place,
    RateReview,
    Search,
    Star,
    TrendingUp
} from "@mui/icons-material";
import {Link} from "react-router-dom";
import {
    ApiRequests,
    CommunityCategory,
    CommunityPostResponse,
    CommunityReviewResponse,
    ReviewTargetType
} from "../../core/apiConfig";
import {useAuthSession} from "../../core/useAuthSession";
import CommunityPostCard from "../components/CommunityPostCard";
import CommunityReviewCard from "../components/CommunityReviewCard";
import CommunityPublishDialog from "../components/CommunityPublishDialog";
import {categoryLabels, formatCommunityTime, targetTypeLabels} from "../components/communityLabels";

type CommunityTab = "ALL" | CommunityCategory;

const tabs: Array<{value: CommunityTab, label: string, reviewTargetType?: ReviewTargetType}> = [
    {value: "ALL", label: "全部"},
    {value: "TRAVEL_NOTE", label: "旅行分享"},
    {value: "SCENIC_SPOT", label: "景点评价", reviewTargetType: "SCENIC_SPOT"},
    {value: "ROUTE", label: "路线评价", reviewTargetType: "ROUTE"},
    {value: "MERCHANT", label: "商家评价", reviewTargetType: "MERCHANT"},
    {value: "HOTEL", label: "酒店评价", reviewTargetType: "HOTEL"},
];

const statItems = [
    {key: "content", label: "当前内容", icon: <Forum fontSize="small"/>},
    {key: "rating", label: "平均评分", icon: <Star fontSize="small"/>},
    {key: "likes", label: "累计点赞", icon: <Favorite fontSize="small"/>},
    {key: "destination", label: "热门目的地", icon: <Place fontSize="small"/>},
];

const Community = () => {
    const session = useAuthSession();
    const [activeTab, setActiveTab] = useState<CommunityTab>("ALL");
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
    const showPosts = activeTab === "ALL" || activeTab === "TRAVEL_NOTE";
    const showReviews = activeTab === "ALL" || Boolean(selectedTab.reviewTargetType);

    useEffect(() => {
        setLoading(true);
        setError("");
        const category = activeTab === "ALL" ? undefined : activeTab;

        Promise.all([
            showPosts
                ? ApiRequests.listCommunityPosts({
                    category: activeTab === "TRAVEL_NOTE" ? "TRAVEL_NOTE" : undefined,
                    keyword: keyword.trim() || undefined,
                    sort,
                    page: 0,
                    size: 20,
                }, session?.token)
                : Promise.resolve({data: {content: [] as CommunityPostResponse[]}}),
            showReviews
                ? ApiRequests.listCommunityReviews({
                    targetType: selectedTab.reviewTargetType,
                    category: selectedTab.reviewTargetType ? category as CommunityCategory : undefined,
                    page: 0,
                    size: 20,
                })
                : Promise.resolve({data: {content: [] as CommunityReviewResponse[]}}),
        ])
            .then(([postsResponse, reviewsResponse]) => {
                setPosts(postsResponse.data.content);
                setReviews(reviewsResponse.data.content);
            })
            .catch(() => setError("社区内容暂时不可用，请确认 community-service 已启动。"))
            .finally(() => setLoading(false));
    }, [activeTab, keyword, sort, session?.token, refreshKey, selectedTab.reviewTargetType, showPosts, showReviews]);

    const featuredPost = useMemo(() => posts[0], [posts]);
    const feedPosts = useMemo(
        () => featuredPost ? posts.filter(post => post.id !== featuredPost.id) : posts,
        [featuredPost, posts]
    );

    const popularPost = useMemo(
        () => [...posts].sort((left, right) => right.likeCount - left.likeCount)[0],
        [posts]
    );

    const averageRating = useMemo(() => {
        if (reviews.length === 0) return 0;
        return reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
    }, [reviews]);

    const topDestination = useMemo(() => {
        const counts = new Map<string, number>();
        posts.forEach(post => {
            const destination = post.destination?.trim();
            if (destination) counts.set(destination, (counts.get(destination) ?? 0) + 1);
        });
        reviews.forEach(review => {
            const targetName = review.targetName?.trim();
            if (targetName) counts.set(targetName, (counts.get(targetName) ?? 0) + 1);
        });
        return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "等待内容";
    }, [posts, reviews]);

    const totalLikes = useMemo(() => posts.reduce((sum, post) => sum + post.likeCount, 0), [posts]);
    const recentReviews = useMemo(() => reviews.slice(0, 4), [reviews]);

    const stats: Record<string, string | number> = {
        content: posts.length + reviews.length,
        rating: reviews.length > 0 ? averageRating.toFixed(1) : "暂无",
        likes: totalLikes,
        destination: topDestination,
    };

    const handleLike = async (post: CommunityPostResponse) => {
        if (!session) {
            setToast("请先登录后再点赞。");
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
            setToast("点赞失败，请稍后重试。");
        }
    };

    const openPublish = () => {
        if (!session) {
            setToast("请先登录后再发布内容。");
            return;
        }
        setPublishOpen(true);
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
                <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                        <Chip icon={<Forum/>} label="社区" color="primary" variant="outlined"/>
                        <h1 className="mt-4 text-4xl font-bold tracking-normal text-slate-950">旅行社区</h1>
                        <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">
                            分享行程灵感，查看目的地、路线、酒店和本地商家的真实评价。
                        </p>
                    </div>

                    <div className="grid w-full max-w-2xl grid-cols-2 gap-3 md:grid-cols-4">
                        {statItems.map(item => (
                            <div key={item.key} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                                    {item.icon}
                                </div>
                                <p className="text-xs font-semibold uppercase text-slate-400">{item.label}</p>
                                <p className="mt-1 truncate text-lg font-bold text-slate-950">{stats[item.key]}</p>
                            </div>
                        ))}
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

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                                sx={{minWidth: {xs: "100%", sm: 260}}}
                            />
                            <TextField
                                size="small"
                                select
                                label="排序"
                                value={sort}
                                onChange={event => setSort(event.target.value as "latest" | "popular")}
                                sx={{width: {xs: "100%", sm: 132}}}
                            >
                                <MenuItem value="latest">最新</MenuItem>
                                <MenuItem value="popular">热门</MenuItem>
                            </TextField>
                            <Button variant="contained" startIcon={<Add/>} onClick={openPublish} sx={{whiteSpace: "nowrap"}}>
                                发布内容
                            </Button>
                        </div>
                    </div>
                </section>

                {loading && <Box sx={{height: 5}} className="mt-5"><LinearProgress/></Box>}
                {error && <Alert severity="warning" className="mt-5">{error}</Alert>}

                <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="space-y-5">
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
                                            <img src={featuredPost.imageUrls[0]} alt={featuredPost.title} className="h-full w-full object-cover"/>
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

                        {showReviews && reviews.length > 0 &&
                            <section className="grid gap-4">
                                <div className="flex items-center justify-between gap-3">
                                    <h2 className="text-xl font-bold text-slate-950">真实评价</h2>
                                    <Chip size="small" label={`${reviews.length} 条`} variant="outlined"/>
                                </div>
                                {reviews.map(review => (
                                    <CommunityReviewCard key={`review-${review.id}`} review={review}/>
                                ))}
                            </section>
                        }

                        {!loading && !error && posts.length === 0 && reviews.length === 0 &&
                            <section className="rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center">
                                <Forum className="text-slate-300" fontSize="large"/>
                                <p className="mt-3 font-semibold text-slate-700">当前分类暂无内容</p>
                                <p className="mt-1 text-sm text-slate-500">切换分类或发布第一条社区内容。</p>
                            </section>
                        }
                    </div>

                    <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
                        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="text-lg font-bold text-slate-950">社区动向</h2>
                                <TrendingUp className="text-blue-600"/>
                            </div>
                            <div className="mt-4 grid gap-3 text-sm">
                                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                                    <span className="text-slate-500">当前筛选</span>
                                    <span className="font-semibold text-slate-900">{selectedTab.label}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                                    <span className="text-slate-500">最高热度</span>
                                    <span className="truncate font-semibold text-slate-900">{popularPost?.title ?? "暂无帖子"}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                                    <span className="text-slate-500">平均评分</span>
                                    <span className="font-semibold text-slate-900">{reviews.length > 0 ? `${averageRating.toFixed(1)} / 5` : "暂无评分"}</span>
                                </div>
                            </div>
                        </section>

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

                        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                            <h2 className="text-lg font-bold text-slate-950">内容分类</h2>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {tabs.slice(1).map(tab => (
                                    <Button
                                        key={tab.value}
                                        size="small"
                                        variant={activeTab === tab.value ? "contained" : "outlined"}
                                        onClick={() => setActiveTab(tab.value)}
                                    >
                                        {tab.label}
                                    </Button>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex items-center gap-2">
                                <RateReview className="text-amber-600"/>
                                <h2 className="text-lg font-bold text-slate-950">发布入口</h2>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-600">分享攻略、记录体验，或为景点、路线、酒店写下评价。</p>
                            <Button fullWidth variant="contained" startIcon={<Add/>} onClick={openPublish} sx={{mt: 2}}>
                                发布内容
                            </Button>
                        </section>
                    </aside>
                </div>
            </main>

            <CommunityPublishDialog
                open={publishOpen}
                token={session?.token}
                onClose={() => setPublishOpen(false)}
                onPublished={() => {
                    setToast("发布成功。");
                    setRefreshKey(value => value + 1);
                }}
            />
        </div>
    );
};

export default Community;
