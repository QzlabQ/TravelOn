import React, {useCallback, useEffect, useState} from "react";
import {Alert, Avatar, Button, LinearProgress, Snackbar, TextField, ToggleButton, ToggleButtonGroup} from "@mui/material";
import {ChatBubbleOutline, Delete, ThumbUp, ThumbUpOutlined} from "@mui/icons-material";
import {ApiRequests, CommentResponse, CommentSort} from "../../core/apiConfig";
import {useAuthSession} from "../../core/useAuthSession";
import {isCurrentUserAdmin} from "../../core/currentUser";
import {formatCommunityTime} from "./communityLabels";

type Props = {
    postId: string,
    onCountChange?: (count: number) => void,
};

const PostComments = ({postId, onCountChange}: Props) => {
    const session = useAuthSession();
    const isAdmin = isCurrentUserAdmin();
    const [comments, setComments] = useState<CommentResponse[]>([]);
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [toast, setToast] = useState("");
    const [sort, setSort] = useState<CommentSort>("likes");
    const [likingIds, setLikingIds] = useState<Set<string>>(new Set());

    const load = useCallback(() => {
        setLoading(true);
        setError("");
        ApiRequests.listPostComments(postId, sort, session?.token)
            .then(response => {
                setComments(response.data);
                onCountChange?.(response.data.length);
            })
            .catch(() => setError("评论暂时无法加载"))
            .finally(() => setLoading(false));
    }, [onCountChange, postId, session?.token, sort]);

    useEffect(() => {
        load();
    }, [load]);

    const sortComments = useCallback((items: CommentResponse[]) => {
        return [...items].sort((a, b) => {
            if (sort === "likes") {
                const likeDelta = b.likeCount - a.likeCount;
                if (likeDelta !== 0) return likeDelta;
            }
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    }, [sort]);

    const submit = async () => {
        if (!session) {
            setError("请先登录后再评论");
            return;
        }
        const trimmed = content.trim();
        if (!trimmed) {
            setError("评论内容不能为空");
            return;
        }

        setSubmitting(true);
        setError("");
        try {
            const response = await ApiRequests.createPostComment(session.token, postId, {content: trimmed});
            setComments(current => {
                const next = sortComments([response.data, ...current]);
                onCountChange?.(next.length);
                return next;
            });
            setContent("");
        } catch {
            setError("评论发布失败，请稍后重试");
        } finally {
            setSubmitting(false);
        }
    };

    const toggleCommentLike = async (comment: CommentResponse) => {
        if (likingIds.has(comment.id)) {
            return;
        }
        if (!session) {
            setToast("请先登录后再点赞");
            return;
        }

        const previousComments = comments;
        const nextLiked = !comment.likedByCurrentUser;
        setLikingIds(current => new Set(current).add(comment.id));
        setComments(current => sortComments(current.map(item => item.id === comment.id ? {
            ...item,
            likedByCurrentUser: nextLiked,
            likeCount: Math.max(0, item.likeCount + (nextLiked ? 1 : -1)),
        } : item)));

        try {
            const response = await ApiRequests.togglePostCommentLike(session.token, postId, comment.id);
            setComments(current => sortComments(current.map(item => item.id === comment.id ? {
                ...item,
                likedByCurrentUser: response.data.liked,
                likeCount: response.data.likeCount,
            } : item)));
        } catch {
            setComments(previousComments);
            setToast("点赞失败，请稍后重试");
        } finally {
            setLikingIds(current => {
                const next = new Set(current);
                next.delete(comment.id);
                return next;
            });
        }
    };

    const deleteComment = async (comment: CommentResponse) => {
        if (!session) return;
        if (!window.confirm("确定删除这条评论？")) return;
        try {
            await ApiRequests.deletePostComment(session.token, postId, comment.id);
            setComments(current => {
                const next = current.filter(item => item.id !== comment.id);
                onCountChange?.(next.length);
                return next;
            });
        } catch {
            setToast("删除失败，请稍后重试");
        }
    };

    const canDeleteComment = (comment: CommentResponse) =>
        Boolean(session && (isAdmin || session.user.id === comment.authorUserId));

    return (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <Snackbar
                open={Boolean(toast)}
                autoHideDuration={2200}
                onClose={() => setToast("")}
                message={toast}
                anchorOrigin={{vertical: "top", horizontal: "center"}}
            />

            <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
                    <ChatBubbleOutline fontSize="small"/>
                    评论
                </h2>
                <span className="text-sm text-slate-500">{comments.length}</span>
            </div>

            {error && <Alert severity="warning" sx={{mt: 2}}>{error}</Alert>}

            <div className="mt-4 flex flex-col gap-3">
                <TextField
                    value={content}
                    onChange={event => setContent(event.target.value)}
                    multiline
                    minRows={3}
                    inputProps={{maxLength: 2000}}
                    placeholder={session ? "写下你的评论" : "登录后可以评论"}
                    size="small"
                    fullWidth
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={sort}
                        onChange={(_, value: CommentSort | null) => value && setSort(value)}
                    >
                        <ToggleButton value="latest">按时间</ToggleButton>
                        <ToggleButton value="likes">按点赞数</ToggleButton>
                    </ToggleButtonGroup>
                    <Button variant="contained" onClick={submit} disabled={submitting || !content.trim()}>
                        {submitting ? "发布中" : "发布评论"}
                    </Button>
                </div>
            </div>

            {loading && <LinearProgress sx={{mt: 3}}/>}

            <div className="mt-5 space-y-4">
                {comments.map(comment => (
                    <article key={comment.id} className="flex gap-3 border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
                        <Avatar sx={{width: 32, height: 32, fontSize: 14}}>
                            {(comment.authorName || "评").trim().slice(0, 1)}
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-slate-800">{comment.authorName}</span>
                                <span className="text-xs text-slate-400">{formatCommunityTime(comment.createdAt)}</span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{comment.content}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <Button
                                    size="small"
                                    variant={comment.likedByCurrentUser ? "contained" : "outlined"}
                                    color={comment.likedByCurrentUser ? "primary" : "inherit"}
                                    startIcon={comment.likedByCurrentUser ? <ThumbUp/> : <ThumbUpOutlined/>}
                                    onClick={() => toggleCommentLike(comment)}
                                    disabled={likingIds.has(comment.id)}
                                >
                                    {comment.likeCount}
                                </Button>
                                {canDeleteComment(comment) && (
                                    <Button
                                        size="small"
                                        color="error"
                                        variant="outlined"
                                        startIcon={<Delete/>}
                                        onClick={() => deleteComment(comment)}
                                    >
                                        删除
                                    </Button>
                                )}
                            </div>
                        </div>
                    </article>
                ))}
                {!loading && comments.length === 0 &&
                    <p className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
                        暂无评论
                    </p>
                }
            </div>
        </section>
    );
};

export default PostComments;
