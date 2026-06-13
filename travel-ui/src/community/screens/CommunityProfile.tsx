import React, {useEffect, useState} from "react";
import {Alert, Box, Button, Chip, LinearProgress, Rating, Tab, Tabs} from "@mui/material";
import {ArrowBack, Landscape, Login, Place} from "@mui/icons-material";
import {Link, useSearchParams} from "react-router-dom";
import {
    ApiRequests,
    AttractionResponse,
    CommunityPostResponse,
    CommunityReviewResponse,
    resolveCommunityImageUrl,
    TravelRouteResponse
} from "../../core/apiConfig";
import {useAuthSession} from "../../core/useAuthSession";
import CommunityPostCard from "../components/CommunityPostCard";
import CommunityReviewCard from "../components/CommunityReviewCard";
import RouteCard from "../components/RouteCard";

type ProfileTab = "favorites" | "posts" | "routes" | "reviews";

const EmptyState = ({text}: {text: string}) => (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
        {text}
    </div>
);

const AttractionCard = ({attraction, state}: {attraction: AttractionResponse, state?: {returnTo?: string, returnLabel?: string}}) => (
    <Link
        to={`/community/attractions/${attraction.id}`}
        state={state}
        className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md"
    >
        <div className="h-40 bg-slate-100">
            {attraction.coverImageUrl
                ? <img src={resolveCommunityImageUrl(attraction.coverImageUrl)} alt={attraction.name} className="h-full w-full object-cover"/>
                : <div className="flex h-full items-center justify-center text-slate-300"><Landscape sx={{fontSize: 48}}/></div>
            }
        </div>
        <div className="flex flex-1 flex-col p-4">
            <h3 className="line-clamp-1 text-base font-bold text-slate-950 group-hover:text-blue-600">{attraction.name}</h3>
            {attraction.city && (
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <Place sx={{fontSize: 14}}/>{attraction.city}
                </p>
            )}
            <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-slate-500">
                {attraction.reviewCount > 0
                    ? <span className="flex items-center gap-1"><Rating value={attraction.averageRating} readOnly size="small" precision={0.1}/>{attraction.averageRating.toFixed(1)}</span>
                    : <span>暂无评分</span>
                }
                <span>{attraction.reviewCount} 条评价</span>
            </div>
        </div>
    </Link>
);

const PROFILE_TABS: ProfileTab[] = ["favorites", "posts", "routes", "reviews"];

const CommunityProfile = () => {
    const session = useAuthSession();
    // Drive the active tab from the URL so detail pages can navigate back to the exact tab.
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get("tab") as ProfileTab | null;
    const tab: ProfileTab = tabParam && PROFILE_TABS.includes(tabParam) ? tabParam : "favorites";
    const setTab = (next: ProfileTab) => setSearchParams({tab: next}, {replace: true});

    // Return targets so detail pages send the user back to the originating tab.
    const favoritesNav = {returnTo: "/community/me?tab=favorites", returnLabel: "返回我的收藏"};
    const postsNav = {returnTo: "/community/me?tab=posts", returnLabel: "返回我的帖子"};
    const routesNav = {returnTo: "/community/me?tab=routes", returnLabel: "返回我的线路"};
    const reviewsNav = {returnTo: "/community/me?tab=reviews", returnLabel: "返回我的评价"};
    const [favoritePosts, setFavoritePosts] = useState<CommunityPostResponse[]>([]);
    const [favoriteRoutes, setFavoriteRoutes] = useState<TravelRouteResponse[]>([]);
    const [favoriteAttractions, setFavoriteAttractions] = useState<AttractionResponse[]>([]);
    const [myPosts, setMyPosts] = useState<CommunityPostResponse[]>([]);
    const [myRoutes, setMyRoutes] = useState<TravelRouteResponse[]>([]);
    const [myReviews, setMyReviews] = useState<CommunityReviewResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!session) return;
        setLoading(true);
        setError("");
        Promise.all([
            ApiRequests.listMyFavoritePosts(session.token),
            ApiRequests.listMyFavoriteRoutes(session.token),
            ApiRequests.listMyFavoriteAttractions(session.token),
            ApiRequests.listMyPosts(session.token),
            ApiRequests.listMyRoutes(session.token),
            ApiRequests.listMyReviews(session.token),
        ])
            .then(([favPosts, favRoutes, favAttractions, posts, routes, reviews]) => {
                setFavoritePosts(favPosts.data);
                setFavoriteRoutes(favRoutes.data);
                setFavoriteAttractions(favAttractions.data);
                setMyPosts(posts.data);
                setMyRoutes(routes.data);
                setMyReviews(reviews.data);
            })
            .catch(() => setError("我的社区内容暂时无法加载"))
            .finally(() => setLoading(false));
    }, [session]);

    const noopLike = () => {};

    if (!session) {
        return (
            <main className="mx-auto max-w-3xl px-6 py-10">
                <Button component={Link} to="/community" startIcon={<ArrowBack/>} variant="outlined">返回社区</Button>
                <section className="mt-6 rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <Login className="text-slate-300" fontSize="large"/>
                    <h1 className="mt-3 text-2xl font-bold text-slate-950">请先登录</h1>
                    <p className="mt-2 text-sm text-slate-500">登录后可以查看收藏、发布和评价记录。</p>
                    <Button component={Link} to="/account" variant="contained" sx={{mt: 4}}>去登录</Button>
                </section>
            </main>
        );
    }

    return (
        <div className="min-h-screen bg-[#f6f7fb]">
            <main className="mx-auto max-w-7xl px-6 py-8">
                <Button component={Link} to="/community" startIcon={<ArrowBack/>} variant="outlined">返回社区</Button>

                <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-950">我的</h1>
                            <p className="mt-1 text-sm text-slate-500">收藏、发布和评价记录</p>
                        </div>
                        <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto">
                            <Tab value="favorites" label="收藏"/>
                            <Tab value="posts" label="广场帖子"/>
                            <Tab value="routes" label="线旅游路"/>
                            <Tab value="reviews" label="景点评价"/>
                        </Tabs>
                    </div>
                </section>

                {loading && <Box sx={{height: 5}} className="mt-5"><LinearProgress/></Box>}
                {error && <Alert severity="warning" className="mt-5">{error}</Alert>}

                <div className="mt-6">
                    {tab === "favorites" && (
                        <div className="space-y-8">
                            <section>
                                <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-slate-950">
                                    帖子收藏 <Chip size="small" label={favoritePosts.length}/>
                                </h2>
                                <div className="grid gap-4">
                                    {favoritePosts.map(post => <CommunityPostCard key={post.id} post={post} onLike={noopLike} canLike={false} navState={favoritesNav}/>)}
                                    {favoritePosts.length === 0 && <EmptyState text="暂无收藏帖子"/>}
                                </div>
                            </section>

                            <section>
                                <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-slate-950">
                                    线路收藏 <Chip size="small" label={favoriteRoutes.length}/>
                                </h2>
                                <div className="grid gap-5">
                                    {favoriteRoutes.map(route => <RouteCard key={route.id} route={route} state={favoritesNav}/>)}
                                    {favoriteRoutes.length === 0 && <EmptyState text="暂无收藏线路"/>}
                                </div>
                            </section>

                            <section>
                                <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-slate-950">
                                    景点收藏 <Chip size="small" label={favoriteAttractions.length}/>
                                </h2>
                                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                    {favoriteAttractions.map(attraction => <AttractionCard key={attraction.id} attraction={attraction} state={favoritesNav}/>)}
                                    {favoriteAttractions.length === 0 && <EmptyState text="暂无收藏景点"/>}
                                </div>
                            </section>
                        </div>
                    )}

                    {tab === "posts" && (
                        <div className="grid gap-4">
                            {myPosts.map(post => <CommunityPostCard key={post.id} post={post} onLike={noopLike} canLike={false} navState={postsNav}/>)}
                            {myPosts.length === 0 && <EmptyState text="你还没有发布帖子"/>}
                        </div>
                    )}

                    {tab === "routes" && (
                        <div className="grid gap-5">
                            {myRoutes.map(route => <RouteCard key={route.id} route={route} state={routesNav}/>)}
                            {myRoutes.length === 0 && <EmptyState text="你还没有发布线路"/>}
                        </div>
                    )}

                    {tab === "reviews" && (
                        <div className="grid gap-4 xl:grid-cols-2">
                            {myReviews.map(review => <CommunityReviewCard key={review.id} review={review} linkToTarget state={reviewsNav} onDeleted={id => setMyReviews(current => current.filter(item => item.id !== id))}/>)}
                            {myReviews.length === 0 && <EmptyState text="你还没有发布评价"/>}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default CommunityProfile;
