import React, {useCallback, useEffect, useState} from "react";
import {Alert, Box, Button, Chip, LinearProgress, Snackbar} from "@mui/material";
import {ArrowBack, Delete, Favorite, FavoriteBorder, Landscape, LocationOn, Route as RouteIcon} from "@mui/icons-material";
import {Link, useLocation, useNavigate, useParams} from "react-router-dom";
import {ApiRequests, CommunityPostResponse} from "../../core/apiConfig";
import {useAuthSession} from "../../core/useAuthSession";
import {isCurrentUserAdmin} from "../../core/currentUser";
import {formatCommunityTime} from "../components/communityLabels";
import FavoriteButton from "../components/FavoriteButton";
import ImageCarousel from "../components/ImageCarousel";
import PostComments from "../components/PostComments";

const CommunityPostDetails = () => {
    const {postId = ""} = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const session = useAuthSession();
    const isAdmin = isCurrentUserAdmin();
    const returnState = location.state as {returnTo?: string, returnLabel?: string} | null;
    const returnTo = returnState?.returnTo ?? "/community";
    const returnLabel = returnState?.returnLabel ?? "返回社区";
    const [post, setPost] = useState<CommunityPostResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [toast, setToast] = useState("");
    const [adminBusy, setAdminBusy] = useState(false);

    useEffect(() => {
        if (!postId) return;
        setLoading(true);
        setError("");
        ApiRequests.getCommunityPost(postId, session?.token)
            .then(response => setPost(response.data))
            .catch(() => setError("帖子详情暂时不可用"))
            .finally(() => setLoading(false));
    }, [postId, session?.token]);

    const handleLike = async () => {
        if (!session || !post) {
            setToast("请先登录后再点赞");
            return;
        }
        try {
            const response = await ApiRequests.toggleCommunityPostLike(session.token, post.id);
            setPost({...post, likedByCurrentUser: response.data.liked, likeCount: response.data.likeCount});
        } catch {
            setToast("点赞失败，请稍后重试");
        }
    };

    const handleCommentCountChange = useCallback((count: number) => {
        setPost(current => {
            if (!current || current.commentCount === count) return current;
            return {...current, commentCount: count};
        });
    }, []);

    const deletePost = async () => {
        if (!session || !post) return;
        if (!window.confirm("确定删除这篇帖子？")) return;
        setAdminBusy(true);
        try {
            await ApiRequests.deleteCommunityPost(session.token, post.id);
            navigate(returnTo);
        } catch {
            setToast("删除失败，请稍后重试");
        } finally {
            setAdminBusy(false);
        }
    };

    const canManagePost = Boolean(session && post && (isAdmin || session.user.id === post.authorUserId));

    const associatedPath = post?.associatedTargetType === "ROUTE"
        ? `/community/routes/${post.associatedTargetId}`
        : post?.associatedTargetType === "SCENIC_SPOT"
            ? `/community/attractions/${post.associatedTargetId}`
            : "";
    const associatedLabel = post?.associatedTargetType === "ROUTE" ? "关联线路" : "关联景点";
    const associatedIcon = post?.associatedTargetType === "ROUTE" ? <RouteIcon/> : <Landscape/>;

    return (
        <div className="min-h-screen bg-[#f6f7fb]">
            <Snackbar
                open={Boolean(toast)}
                autoHideDuration={2200}
                onClose={() => setToast("")}
                message={toast}
                anchorOrigin={{vertical: "top", horizontal: "center"}}
            />

            <main className="mx-auto max-w-7xl px-6 py-8">
                <Button component={Link} to={returnTo} startIcon={<ArrowBack/>} variant="outlined">
                    {returnLabel}
                </Button>

                {loading && <Box sx={{height: 5}} className="mt-5"><LinearProgress/></Box>}
                {error && <Alert severity="warning" className="mt-5">{error}</Alert>}

                {post &&
                    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
                        <div className="space-y-6">
                            <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                                {post.imageUrls.length > 0 &&
                                    <ImageCarousel images={post.imageUrls} alt={post.title}/>
                                }

                                <div className="p-7">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {post.destination && <Chip size="small" icon={<LocationOn/>} label={post.destination}/>}
                                    </div>
                                    <h1 className="mt-4 text-4xl font-bold leading-tight text-slate-950">{post.title}</h1>
                                    <p className="mt-3 text-sm text-slate-500">
                                        {post.authorName} · {formatCommunityTime(post.createdAt)}
                                    </p>
                                    {associatedPath && post.associatedTargetName && (
                                        <Button
                                            component={Link}
                                            to={associatedPath}
                                            state={{returnTo: `/community/posts/${post.id}`, returnLabel: "返回帖子"}}
                                            startIcon={associatedIcon}
                                            variant="outlined"
                                            sx={{mt: 4}}
                                        >
                                            {associatedLabel}：{post.associatedTargetName}
                                        </Button>
                                    )}
                                    <div className="mt-6 whitespace-pre-wrap text-base leading-8 text-slate-700">{post.content}</div>
                                </div>
                            </article>

                            <PostComments
                                postId={post.id}
                                onCountChange={handleCommentCountChange}
                            />
                        </div>

                        <aside className="space-y-5 lg:sticky lg:top-24">
                            {canManagePost && (
                                <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                                    <h2 className="text-lg font-bold text-slate-950">{isAdmin && post.authorUserId !== session?.user.id ? "管理员操作" : "管理我的帖子"}</h2>
                                    <Button
                                        fullWidth
                                        color="error"
                                        variant="outlined"
                                        startIcon={<Delete/>}
                                        disabled={adminBusy}
                                        onClick={deletePost}
                                        sx={{mt: 2}}
                                    >
                                        删除帖子
                                    </Button>
                                </section>
                            )}

                            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                                <h2 className="text-lg font-bold text-slate-950">互动</h2>
                                <div className="mt-3 grid gap-3">
                                    <FavoriteButton
                                        type="POST"
                                        targetId={post.id}
                                        initialFavorited={post.favoritedByCurrentUser}
                                        fullWidth
                                        onChange={favorited => setPost(current => current ? {...current, favoritedByCurrentUser: favorited} : current)}
                                    />
                                    <Button
                                        fullWidth
                                        variant={post.likedByCurrentUser ? "contained" : "outlined"}
                                        color={post.likedByCurrentUser ? "error" : "primary"}
                                        startIcon={post.likedByCurrentUser ? <Favorite/> : <FavoriteBorder/>}
                                        onClick={handleLike}
                                    >
                                        {post.likeCount} 人点赞
                                    </Button>
                                </div>
                                <p className="mt-3 text-center text-sm text-slate-500">{post.commentCount} 条评论</p>
                            </section>
                        </aside>
                    </div>
                }
            </main>
        </div>
    );
};

export default CommunityPostDetails;
