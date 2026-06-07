import React, {useEffect, useMemo, useState} from "react";
import {Alert, Box, Button, Chip, LinearProgress, MenuItem, Snackbar, Tab, Tabs, TextField} from "@mui/material";
import {Add, Forum, Search} from "@mui/icons-material";
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

type CommunityTab = "ALL" | CommunityCategory;

const tabs: Array<{value: CommunityTab, label: string, reviewTargetType?: ReviewTargetType}> = [
    {value: "ALL", label: "全部"},
    {value: "TRAVEL_NOTE", label: "旅游分享"},
    {value: "SCENIC_SPOT", label: "景点评价", reviewTargetType: "SCENIC_SPOT"},
    {value: "ROUTE", label: "路线评价", reviewTargetType: "ROUTE"},
    {value: "MERCHANT", label: "商家评价", reviewTargetType: "MERCHANT"},
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
        <div className="min-h-screen bg-slate-50 px-8 py-8">
            <Snackbar open={Boolean(toast)} autoHideDuration={2200} onClose={() => setToast("")} message={toast}/>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <Chip icon={<Forum/>} label="社区" color="primary" variant="outlined"/>
                    <h1 className="mt-3 text-4xl font-bold text-slate-950">旅行社区</h1>
                    <p className="mt-2 text-sm text-slate-500">分享行程经验，查看景点、路线和商家的真实评价。</p>
                </div>
                <Button variant="contained" startIcon={<Add/>} onClick={openPublish}>发布内容</Button>
            </div>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)}>
                        {tabs.map(tab => <Tab key={tab.value} value={tab.value} label={tab.label}/>)}
                    </Tabs>
                    <div className="flex flex-wrap items-center gap-3">
                        <TextField
                            size="small"
                            placeholder="搜索帖子"
                            value={keyword}
                            onChange={event => setKeyword(event.target.value)}
                            InputProps={{startAdornment: <Search fontSize="small" className="mr-2 text-slate-400"/>}}
                        />
                        <TextField
                            size="small"
                            select
                            label="排序"
                            value={sort}
                            onChange={event => setSort(event.target.value as "latest" | "popular")}
                            sx={{width: 120}}
                        >
                            <MenuItem value="latest">最新</MenuItem>
                            <MenuItem value="popular">热门</MenuItem>
                        </TextField>
                    </div>
                </div>
            </section>

            {loading && <Box sx={{height: 5}} className="mt-5"><LinearProgress/></Box>}
            {error && <Alert severity="warning" className="mt-5">{error}</Alert>}

            <main className="mt-6 grid gap-5">
                {posts.map(post => (
                    <CommunityPostCard key={`post-${post.id}`} post={post} onLike={handleLike} canLike={Boolean(session)}/>
                ))}
                {reviews.map(review => (
                    <CommunityReviewCard key={`review-${review.id}`} review={review}/>
                ))}
                {!loading && !error && posts.length === 0 && reviews.length === 0 &&
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center text-slate-500">
                        当前分类暂无内容。
                    </div>
                }
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
