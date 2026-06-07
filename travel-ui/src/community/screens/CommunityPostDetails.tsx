import React, {useEffect, useState} from "react";
import {Alert, Box, Button, Chip, LinearProgress, Snackbar} from "@mui/material";
import {ArrowBack, Favorite, FavoriteBorder, LocationOn} from "@mui/icons-material";
import {Link, useParams} from "react-router-dom";
import {ApiRequests, CommunityPostResponse, CommunityReviewResponse} from "../../core/apiConfig";
import {useAuthSession} from "../../core/useAuthSession";
import {categoryLabels, formatCommunityTime} from "../components/communityLabels";
import CommunityReviewCard from "../components/CommunityReviewCard";

const CommunityPostDetails = () => {
    const {postId = ""} = useParams();
    const session = useAuthSession();
    const [post, setPost] = useState<CommunityPostResponse | null>(null);
    const [reviews, setReviews] = useState<CommunityReviewResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [toast, setToast] = useState("");

    useEffect(() => {
        if (!postId) return;
        setLoading(true);
        setError("");
        ApiRequests.getCommunityPost(postId, session?.token)
            .then(response => {
                setPost(response.data);
                const targetId = response.data.destination || response.data.title;
                return ApiRequests.listCommunityReviews({targetId, page: 0, size: 6});
            })
            .then(response => setReviews(response.data.content))
            .catch(() => setError("帖子详情暂时不可用。"))
            .finally(() => setLoading(false));
    }, [postId, session?.token]);

    const handleLike = async () => {
        if (!session || !post) {
            setToast("请先登录后再点赞。");
            return;
        }
        try {
            const response = await ApiRequests.toggleCommunityPostLike(session.token, post.id);
            setPost({...post, likedByCurrentUser: response.data.liked, likeCount: response.data.likeCount});
        } catch {
            setToast("点赞失败，请稍后重试。");
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 px-8 py-8">
            <Snackbar open={Boolean(toast)} autoHideDuration={2200} onClose={() => setToast("")} message={toast}/>
            <Button component={Link} to="/community" startIcon={<ArrowBack/>} variant="outlined" sx={{borderRadius: 2}}>
                返回社区
            </Button>
            {loading && <Box sx={{height: 5}} className="mt-5"><LinearProgress/></Box>}
            {error && <Alert severity="warning" className="mt-5">{error}</Alert>}
            {post &&
                <main className="mt-6 grid grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
                    <article className="rounded-lg border border-slate-200 bg-white p-7 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            <Chip size="small" label={categoryLabels[post.category]} color="primary" variant="outlined"/>
                            {post.destination && <Chip size="small" icon={<LocationOn/>} label={post.destination}/>}
                        </div>
                        <h1 className="mt-4 text-4xl font-bold text-slate-950">{post.title}</h1>
                        <p className="mt-3 text-sm text-slate-500">{post.authorName} · {formatCommunityTime(post.createdAt)}</p>
                        {post.imageUrls.length > 0 &&
                            <div className="mt-6 grid gap-3">
                                {post.imageUrls.map(url => (
                                    <img key={url} src={url} alt={post.title} className="max-h-[520px] w-full rounded-lg object-cover"/>
                                ))}
                            </div>
                        }
                        <div className="mt-6 whitespace-pre-wrap text-base leading-8 text-slate-700">{post.content}</div>
                    </article>
                    <aside className="sticky top-24 space-y-5">
                        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                            <h2 className="text-lg font-bold text-slate-950">互动</h2>
                            <Button
                                fullWidth
                                sx={{mt: 2, borderRadius: 2}}
                                variant={post.likedByCurrentUser ? "contained" : "outlined"}
                                color={post.likedByCurrentUser ? "error" : "primary"}
                                startIcon={post.likedByCurrentUser ? <Favorite/> : <FavoriteBorder/>}
                                onClick={handleLike}
                            >
                                {post.likeCount} 人点赞
                            </Button>
                        </section>
                        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                            <h2 className="text-lg font-bold text-slate-950">相关评价</h2>
                            <div className="mt-4 grid gap-3">
                                {reviews.map(review => <CommunityReviewCard key={review.id} review={review}/>)}
                                {reviews.length === 0 && <p className="rounded-lg bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">暂无相关评价</p>}
                            </div>
                        </section>
                    </aside>
                </main>
            }
        </div>
    );
};

export default CommunityPostDetails;
