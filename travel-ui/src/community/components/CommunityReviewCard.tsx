import React, {useEffect, useState} from "react";
import {Avatar, Button, Rating, Snackbar} from "@mui/material";
import {ThumbUp, ThumbUpOutlined} from "@mui/icons-material";
import {ApiRequests, CommunityReviewResponse, resolveCommunityImageUrl} from "../../core/apiConfig";
import {useAuthSession} from "../../core/useAuthSession";
import {formatCommunityTime} from "./communityLabels";
import ImageLightbox, {useLightbox} from "./ImageLightbox";

type Props = {
    review: CommunityReviewResponse,
};

const CommunityReviewCard = ({review}: Props) => {
    const authorInitial = review.authorName?.trim()?.slice(0, 1) || "评";
    const images = review.imageUrls?.slice(0, 6) ?? [];
    const lightbox = useLightbox();
    const session = useAuthSession();
    const [liked, setLiked] = useState(review.likedByCurrentUser);
    const [likeCount, setLikeCount] = useState(review.likeCount);
    const [toast, setToast] = useState("");
    const [expanded, setExpanded] = useState(false);
    const canExpand = review.content.length > 120;

    useEffect(() => {
        setLiked(review.likedByCurrentUser);
        setLikeCount(review.likeCount);
    }, [review.id, review.likedByCurrentUser, review.likeCount]);

    const toggleLike = async () => {
        if (!session) {
            setToast("请先登录后再点赞");
            return;
        }

        const previousLiked = liked;
        const previousCount = likeCount;
        setLiked(!previousLiked);
        setLikeCount(previousCount + (previousLiked ? -1 : 1));
        try {
            const response = await ApiRequests.toggleReviewLike(session.token, review.id);
            setLiked(response.data.liked);
            setLikeCount(response.data.likeCount);
        } catch {
            setLiked(previousLiked);
            setLikeCount(previousCount);
            setToast("点赞失败，请稍后重试");
        }
    };

    return (
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-amber-200 hover:shadow-md">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <Rating value={review.rating} readOnly size="small"/>
                    <h3 className="mt-2 line-clamp-1 text-lg font-bold text-slate-950">{review.targetName}</h3>
                </div>

                <div className="rounded-lg bg-amber-50 px-3 py-2 text-center">
                    <p className="text-lg font-bold text-amber-700">{review.rating}.0</p>
                    <p className="text-xs text-amber-700">评分</p>
                </div>
            </div>

            <p className={`mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600 ${expanded ? "" : "line-clamp-4"}`}>
                {review.content}
            </p>
            {canExpand && (
                <Button
                    size="small"
                    variant="text"
                    onClick={() => setExpanded(value => !value)}
                    sx={{mt: 0.5, minWidth: 0, px: 0}}
                >
                    {expanded ? "收起" : "展开"}
                </Button>
            )}

            {images.length > 0 &&
                <div className="mt-3 flex flex-wrap gap-2">
                    {images.map((url, index) => (
                        <img
                            key={url}
                            src={resolveCommunityImageUrl(url)}
                            alt={review.targetName}
                            onClick={() => lightbox.openAt(index)}
                            className="h-20 w-20 cursor-zoom-in rounded-lg object-cover transition hover:opacity-90"
                        />
                    ))}
                </div>
            }

            <ImageLightbox
                images={images}
                index={lightbox.index}
                open={lightbox.open}
                onClose={lightbox.close}
                onIndexChange={lightbox.setIndex}
            />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500">
                <div className="flex flex-wrap items-center gap-3">
                    <Avatar sx={{width: 28, height: 28, fontSize: 14}}>{authorInitial}</Avatar>
                    <span className="font-medium text-slate-700">{review.authorName}</span>
                    <span>{formatCommunityTime(review.createdAt)}</span>
                </div>
                <Button
                    size="small"
                    variant={liked ? "contained" : "outlined"}
                    color={liked ? "primary" : "inherit"}
                    startIcon={liked ? <ThumbUp/> : <ThumbUpOutlined/>}
                    onClick={toggleLike}
                >
                    {likeCount}
                </Button>
            </div>

            <Snackbar
                open={Boolean(toast)}
                autoHideDuration={2200}
                onClose={() => setToast("")}
                message={toast}
                anchorOrigin={{vertical: "top", horizontal: "center"}}
            />
        </article>
    );
};

export default CommunityReviewCard;
