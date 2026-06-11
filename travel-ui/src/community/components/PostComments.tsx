import React, {useCallback, useEffect, useState} from "react";
import {Alert, Avatar, Button, LinearProgress, TextField} from "@mui/material";
import {ChatBubbleOutline} from "@mui/icons-material";
import {ApiRequests, CommentResponse} from "../../core/apiConfig";
import {useAuthSession} from "../../core/useAuthSession";
import {formatCommunityTime} from "./communityLabels";

type Props = {
    postId: string,
    onCountChange?: (count: number) => void,
};

const PostComments = ({postId, onCountChange}: Props) => {
    const session = useAuthSession();
    const [comments, setComments] = useState<CommentResponse[]>([]);
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(() => {
        setLoading(true);
        setError("");
        ApiRequests.listPostComments(postId)
            .then(response => {
                setComments(response.data);
                onCountChange?.(response.data.length);
            })
            .catch(() => setError("评论暂时无法加载"))
            .finally(() => setLoading(false));
    }, [onCountChange, postId]);

    useEffect(() => {
        load();
    }, [load]);

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
                const next = [response.data, ...current];
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

    return (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
                <div className="flex justify-end">
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
