import React, {useCallback, useEffect, useMemo, useState} from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    LinearProgress,
    Rating,
    Snackbar,
    TextField,
} from "@mui/material";
import {
    ArrowBack,
    AttachMoney,
    CalendarMonth,
    Groups,
    Landscape,
    Place,
    RateReview,
    Route as RouteIcon,
} from "@mui/icons-material";
import {Link, useParams} from "react-router-dom";
import {ApiRequests, resolveCommunityImageUrl, RouteStopResponse, TravelRouteDetailResponse} from "../../core/apiConfig";
import {useAuthSession} from "../../core/useAuthSession";
import CommunityReviewCard from "../components/CommunityReviewCard";
import CommunityImageUploader from "../components/CommunityImageUploader";
import FavoriteButton from "../components/FavoriteButton";
import ImageLightbox, {useLightbox} from "../components/ImageLightbox";
import {formatCommunityTime, travelStyleLabels} from "../components/communityLabels";

const RouteDetails = () => {
    const {routeId} = useParams<{routeId: string}>();
    const session = useAuthSession();

    const [detail, setDetail] = useState<TravelRouteDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [rating, setRating] = useState<number>(5);
    const [content, setContent] = useState("");
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [reviewError, setReviewError] = useState("");
    const [toast, setToast] = useState("");
    const lightbox = useLightbox();

    const load = useCallback(() => {
        if (!routeId) return;
        setLoading(true);
        setError("");
        ApiRequests.getTravelRoute(routeId, session?.token)
            .then(res => setDetail(res.data))
            .catch(() => setError("线路信息加载失败，请稍后重试。"))
            .finally(() => setLoading(false));
    }, [routeId, session?.token]);

    useEffect(() => { load(); }, [load]);

    // Group stops by day, preserving the backend's day/sort ordering.
    const stopsByDay = useMemo<Array<[number, RouteStopResponse[]]>>(() => {
        const groups: Record<number, RouteStopResponse[]> = {};
        (detail?.stops ?? []).forEach(stop => {
            if (!groups[stop.dayNumber]) groups[stop.dayNumber] = [];
            groups[stop.dayNumber].push(stop);
        });
        return Object.keys(groups)
            .map(Number)
            .sort((a, b) => a - b)
            .map(day => [day, groups[day]]);
    }, [detail]);

    const submitReview = async () => {
        if (!session) {setReviewError("请先登录后再评价。"); return;}
        if (!content.trim()) {setReviewError("评价内容不能为空。"); return;}
        if (!routeId) return;
        setSubmitting(true);
        setReviewError("");
        try {
            await ApiRequests.createTravelRouteReview(session.token, routeId, {rating, content: content.trim(), imageUrls});
            setContent("");
            setRating(5);
            setImageUrls([]);
            setToast("评价发布成功！");
            load();
        } catch {
            setReviewError("评价发布失败，请稍后重试。");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <Box className="p-8"><LinearProgress/></Box>;
    if (error || !detail) return (
        <div className="mx-auto max-w-3xl px-6 py-10">
            <Alert severity="error">{error || "线路不存在。"}</Alert>
            <Link to="/community?tab=ROUTE" className="mt-4 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                <ArrowBack fontSize="small"/>返回线路列表
            </Link>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#f6f7fb]">
            <Snackbar
                open={Boolean(toast)}
                autoHideDuration={2500}
                onClose={() => setToast("")}
                message={toast}
                anchorOrigin={{vertical: "top", horizontal: "center"}}
            />

            {/* Cover */}
            <div className="relative h-72 overflow-hidden bg-slate-200 md:h-[420px]">
                {detail.coverImageUrl
                    ? <img
                        src={resolveCommunityImageUrl(detail.coverImageUrl)}
                        alt={detail.title}
                        onClick={() => detail.imageUrls.length > 0 && lightbox.openAt(0)}
                        className={`h-full w-full object-cover ${detail.imageUrls.length > 0 ? "cursor-zoom-in" : ""}`}
                    />
                    : <div className="flex h-full items-center justify-center text-slate-400"><RouteIcon sx={{fontSize: 64}}/></div>
                }
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"/>
                <div className="pointer-events-none absolute inset-x-0 bottom-0">
                    <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
                        <Link
                            to="/community?tab=ROUTE"
                            className="pointer-events-auto mb-4 inline-flex items-center gap-1 text-sm text-white/80 hover:text-white"
                        >
                            <ArrowBack fontSize="small"/>返回线路列表
                        </Link>
                        <div className="flex flex-wrap items-center gap-2">
                            <Chip size="small" label={travelStyleLabels[detail.style]} sx={{bgcolor: "rgba(255,255,255,0.85)", fontWeight: 600}}/>
                            {detail.city && (
                                <span className="flex items-center gap-1 text-sm text-white/90"><Place fontSize="small"/>{detail.city}</span>
                            )}
                        </div>
                        <h1 className="mt-3 text-4xl font-bold text-white drop-shadow-md md:text-5xl">{detail.title}</h1>
                        <div className="mt-3 flex flex-wrap items-center gap-4 text-white/90">
                            <span className="flex items-center gap-2">
                                <Rating value={detail.averageRating} readOnly precision={0.1} size="small"/>
                                <span className="text-sm font-semibold">
                                    {detail.reviewCount > 0 ? `${detail.averageRating.toFixed(1)} · ${detail.reviewCount} 条评价` : "暂无评分"}
                                </span>
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <main className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
                <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] xl:gap-12">
                    {/* Left: attributes, itinerary, gallery, reviews */}
                    <div className="space-y-8">
                        {/* Key attributes */}
                        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                            {[
                                {icon: <CalendarMonth/>, label: "天数", value: `${detail.days} 天`},
                                {icon: <Groups/>, label: "人数", value: `${detail.peopleCount} 人`},
                                {icon: <AttachMoney/>, label: "人均预算", value: `¥${detail.budget}`},
                                {icon: <RouteIcon/>, label: "景点", value: `${detail.stops.length} 个`},
                            ].map(item => (
                                <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                                    <div className="flex justify-center text-blue-600">{item.icon}</div>
                                    <p className="mt-1 text-lg font-bold text-slate-950">{item.value}</p>
                                    <p className="text-xs text-slate-500">{item.label}</p>
                                </div>
                            ))}
                        </section>

                        {detail.summary && (
                            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
                                <h2 className="text-lg font-bold text-slate-950">线路简介</h2>
                                <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-slate-600">{detail.summary}</p>
                                <p className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-400">
                                    由 {detail.createdByName} 创建 · {formatCommunityTime(detail.createdAt)}
                                </p>
                            </section>
                        )}

                        {/* Itinerary */}
                        <section>
                            <h2 className="mb-4 text-xl font-bold text-slate-950">每日行程</h2>
                            <div className="space-y-6">
                                {stopsByDay.map(([day, dayStops]) => (
                                    <div key={day} className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                                        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
                                            第 {day} 天
                                        </div>
                                        <ol className="space-y-4">
                                            {dayStops.map((stop, index) => (
                                                <li key={`${stop.attractionId}-${index}`} className="flex gap-4">
                                                    <div className="flex flex-col items-center">
                                                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                                                            {index + 1}
                                                        </span>
                                                        {index < dayStops.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200"/>}
                                                    </div>
                                                    <Link
                                                        to={`/community/attractions/${stop.attractionId}`}
                                                        className="group flex flex-1 gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-blue-200 hover:bg-slate-50"
                                                    >
                                                        <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                                                            {stop.coverImageUrl
                                                                ? <img src={resolveCommunityImageUrl(stop.coverImageUrl)} alt={stop.attractionName} className="h-full w-full object-cover"/>
                                                                : <div className="flex h-full items-center justify-center text-slate-300"><Landscape/></div>
                                                            }
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-semibold text-slate-900 group-hover:text-blue-600">{stop.attractionName}</p>
                                                            {stop.attractionCity && (
                                                                <p className="flex items-center gap-1 text-xs text-slate-500">
                                                                    <Place sx={{fontSize: 13}}/>{stop.attractionCity}
                                                                </p>
                                                            )}
                                                            {stop.note && <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{stop.note}</p>}
                                                        </div>
                                                    </Link>
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Gallery */}
                        {detail.imageUrls.length > 0 && (
                            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
                                <h2 className="mb-4 text-lg font-bold text-slate-950">线路相册</h2>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                                    {detail.imageUrls.map((url, index) => (
                                        <img
                                            key={url}
                                            src={resolveCommunityImageUrl(url)}
                                            alt={detail.title}
                                            onClick={() => lightbox.openAt(index)}
                                            className="aspect-[4/3] w-full cursor-zoom-in rounded-xl object-cover transition hover:opacity-90 hover:shadow-md"
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Reviews */}
                        <section>
                            <h2 className="mb-4 text-xl font-bold text-slate-950">
                                线路评价{detail.reviewCount > 0 && <span className="ml-2 text-base font-medium text-slate-400">{detail.reviewCount}</span>}
                            </h2>
                            {detail.latestReviews.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-14 text-center">
                                    <RateReview className="text-slate-300" fontSize="large"/>
                                    <p className="mt-3 font-semibold text-slate-700">暂无评价</p>
                                    <p className="mt-1 text-sm text-slate-500">成为第一个评价此线路的用户！</p>
                                </div>
                            ) : (
                                <div className="grid gap-4 xl:grid-cols-2">
                                    {detail.latestReviews.map(review => (
                                        <CommunityReviewCard key={review.id} review={review}/>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>

                    {/* Right: rating summary + write review */}
                    <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
                        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                            <FavoriteButton
                                type="ROUTE"
                                targetId={detail.id}
                                initialFavorited={detail.favoritedByCurrentUser}
                                fullWidth
                                onChange={favorited => setDetail(current => current ? {...current, favoritedByCurrentUser: favorited} : current)}
                            />
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                            <div className="flex items-end gap-3">
                                <span className="text-5xl font-extrabold leading-none text-slate-950">
                                    {detail.reviewCount > 0 ? detail.averageRating.toFixed(1) : "—"}
                                </span>
                                <span className="pb-1 text-sm text-slate-400">/ 5.0</span>
                            </div>
                            <Rating value={detail.averageRating} readOnly precision={0.1} sx={{mt: 1}}/>
                            <p className="mt-2 text-sm text-slate-500">
                                {detail.reviewCount > 0 ? `基于 ${detail.reviewCount} 条真实评价` : "还没有评价，快来分享你的体验"}
                            </p>
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                            <div className="flex items-center gap-2 text-slate-800">
                                <RateReview/>
                                <h2 className="font-bold">写评价</h2>
                            </div>
                            {reviewError && <Alert severity="error" sx={{mt: 2}}>{reviewError}</Alert>}
                            <div className="mt-4 space-y-4">
                                <div>
                                    <p className="mb-1 text-sm font-semibold text-slate-700">评分</p>
                                    <Rating
                                        value={rating}
                                        onChange={(_, value) => setRating(value ?? 5)}
                                        size="large"
                                    />
                                </div>
                                <TextField
                                    label="评价内容"
                                    value={content}
                                    onChange={e => setContent(e.target.value)}
                                    multiline
                                    minRows={4}
                                    inputProps={{maxLength: 2000}}
                                    fullWidth
                                    required
                                    size="small"
                                />
                                <CommunityImageUploader
                                    token={session?.token}
                                    value={imageUrls}
                                    onChange={setImageUrls}
                                    disabled={submitting}
                                />
                                <Button
                                    variant="contained"
                                    fullWidth
                                    onClick={submitReview}
                                    disabled={submitting}
                                >
                                    {submitting ? "发布中…" : "发布评价"}
                                </Button>
                                {!session && (
                                    <p className="text-center text-xs text-slate-400">登录后可发布评价</p>
                                )}
                            </div>
                        </section>
                    </aside>
                </div>
            </main>

            <ImageLightbox
                images={detail.imageUrls}
                index={lightbox.index}
                open={lightbox.open}
                onClose={lightbox.close}
                onIndexChange={lightbox.setIndex}
            />
        </div>
    );
};

export default RouteDetails;
