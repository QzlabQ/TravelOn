import React, {useCallback, useEffect, useState} from "react";
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
import {ArrowBack, Landscape, Place, RateReview} from "@mui/icons-material";
import {Link, useParams} from "react-router-dom";
import {ApiRequests, AttractionDetailResponse} from "../../core/apiConfig";
import {useAuthSession} from "../../core/useAuthSession";
import CommunityReviewCard from "../components/CommunityReviewCard";
import {formatCommunityTime} from "../components/communityLabels";

const AttractionDetails = () => {
    const {attractionId} = useParams<{attractionId: string}>();
    const session = useAuthSession();

    const [detail, setDetail] = useState<AttractionDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [rating, setRating] = useState<number>(5);
    const [content, setContent] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [reviewError, setReviewError] = useState("");
    const [toast, setToast] = useState("");

    const load = useCallback(() => {
        if (!attractionId) return;
        setLoading(true);
        setError("");
        ApiRequests.getAttraction(attractionId)
            .then(res => setDetail(res.data))
            .catch(() => setError("景点信息加载失败，请稍后重试。"))
            .finally(() => setLoading(false));
    }, [attractionId]);

    useEffect(() => { load(); }, [load]);

    const submitReview = async () => {
        if (!session) {setReviewError("请先登录后再评价。"); return;}
        if (!content.trim()) {setReviewError("评价内容不能为空。"); return;}
        if (!attractionId) return;
        setSubmitting(true);
        setReviewError("");
        try {
            await ApiRequests.createAttractionReview(session.token, attractionId, {rating, content: content.trim()});
            setContent("");
            setRating(5);
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
            <Alert severity="error">{error || "景点不存在。"}</Alert>
            <Link to="/community/attractions" className="mt-4 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                <ArrowBack fontSize="small"/>返回景点列表
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
            <div className="relative h-64 overflow-hidden bg-slate-200 md:h-80">
                {detail.coverImageUrl
                    ? <img src={detail.coverImageUrl} alt={detail.name} className="h-full w-full object-cover"/>
                    : <div className="flex h-full items-center justify-center text-slate-400"><Landscape sx={{fontSize: 64}}/></div>
                }
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"/>
                <div className="absolute bottom-0 left-0 px-6 py-5">
                    <h1 className="text-3xl font-bold text-white drop-shadow">{detail.name}</h1>
                    {detail.city && (
                        <p className="mt-1 flex items-center gap-1 text-sm text-white/80">
                            <Place fontSize="small"/>{detail.city}
                        </p>
                    )}
                </div>
            </div>

            <main className="mx-auto max-w-4xl px-6 py-8">
                <Link to="/community/attractions" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-blue-600">
                    <ArrowBack fontSize="small"/>返回景点列表
                </Link>

                <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="space-y-6">
                        {/* Info card */}
                        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                            <div className="flex flex-wrap items-center gap-3">
                                <Rating value={detail.averageRating} readOnly precision={0.1}/>
                                <span className="text-xl font-bold text-slate-950">
                                    {detail.reviewCount > 0 ? detail.averageRating.toFixed(1) : "暂无评分"}
                                </span>
                                {detail.reviewCount > 0 && (
                                    <Chip size="small" label={`${detail.reviewCount} 条评价`} variant="outlined"/>
                                )}
                            </div>
                            {detail.description && (
                                <p className="mt-4 text-sm leading-7 text-slate-600">{detail.description}</p>
                            )}
                            <p className="mt-4 text-xs text-slate-400">
                                由 {detail.createdByName} 添加 · {formatCommunityTime(detail.createdAt)}
                            </p>
                        </section>

                        {/* Reviews */}
                        <section>
                            <h2 className="mb-4 text-xl font-bold text-slate-950">全部评价</h2>
                            {detail.latestReviews.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center">
                                    <RateReview className="text-slate-300" fontSize="large"/>
                                    <p className="mt-3 font-semibold text-slate-700">暂无评价</p>
                                    <p className="mt-1 text-sm text-slate-500">成为第一个评价此景点的用户！</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {detail.latestReviews.map(review => (
                                        <CommunityReviewCard key={review.id} review={review}/>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>

                    {/* Write review sidebar */}
                    <aside className="lg:sticky lg:top-24 lg:self-start">
                        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
        </div>
    );
};

export default AttractionDetails;
