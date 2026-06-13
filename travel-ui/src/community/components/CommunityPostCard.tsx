import React from "react";
import {Avatar, Button, Chip, Tooltip} from "@mui/material";
import {ArrowForward, Favorite, FavoriteBorder, ImageOutlined, LocationOn} from "@mui/icons-material";
import {useNavigate} from "react-router-dom";
import {CommunityPostResponse, resolveCommunityImageUrl} from "../../core/apiConfig";
import {formatCommunityTime} from "./communityLabels";

type Props = {
    post: CommunityPostResponse,
    onLike: (post: CommunityPostResponse) => void,
    canLike: boolean,
    /** Optional router state so the detail page can navigate back to where this card was shown. */
    navState?: {returnTo?: string, returnLabel?: string},
};

const CommunityPostCard = ({post, onLike, canLike, navState}: Props) => {
    const navigate = useNavigate();
    const coverImage = post.imageUrls?.[0];
    const authorInitial = post.authorName?.trim()?.slice(0, 1) || "旅";
    const detailPath = `/community/posts/${post.id}`;

    const openPost = () => {
        navigate(detailPath, navState ? {state: navState} : undefined);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) {
            return;
        }
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPost();
        }
    };

    return (
        <article
            className="cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md"
            role="link"
            tabIndex={0}
            onClick={openPost}
            onKeyDown={handleKeyDown}
        >
            <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_180px]">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        {post.destination &&
                            <Chip
                                size="small"
                                icon={<LocationOn fontSize="small"/>}
                                label={post.destination}
                                sx={{maxWidth: 220, "& .MuiChip-label": {overflow: "hidden", textOverflow: "ellipsis"}}}
                            />
                        }
                    </div>

                    <h2 className="mt-3 line-clamp-2 text-xl font-bold leading-7 text-slate-950 hover:text-blue-600">
                        {post.title}
                    </h2>

                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{post.content}</p>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                        <Avatar sx={{width: 28, height: 28, fontSize: 14}}>{authorInitial}</Avatar>
                        <span className="font-medium text-slate-700">{post.authorName}</span>
                        <span>{formatCommunityTime(post.createdAt)}</span>
                    </div>
                </div>

                <div className="block h-36 overflow-hidden rounded-lg bg-slate-100 md:h-full">
                    {coverImage ?
                        <img src={resolveCommunityImageUrl(coverImage)} alt={post.title} className="h-full w-full object-cover transition duration-300 hover:scale-105"/>
                        :
                        <div className="flex h-full min-h-36 items-center justify-center text-slate-400">
                            <ImageOutlined fontSize="large"/>
                        </div>
                    }
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700">
                    查看详情 <ArrowForward fontSize="small"/>
                </span>
                <Tooltip title={canLike ? "点赞这篇分享" : "登录后可以点赞"}>
                    <span onClick={event => event.stopPropagation()}>
                        <Button
                            size="small"
                            variant={post.likedByCurrentUser ? "contained" : "outlined"}
                            startIcon={post.likedByCurrentUser ? <Favorite/> : <FavoriteBorder/>}
                            onClick={event => {
                                event.stopPropagation();
                                onLike(post);
                            }}
                            color={post.likedByCurrentUser ? "error" : "primary"}
                            sx={{minWidth: 86}}
                        >
                            {post.likeCount}
                        </Button>
                    </span>
                </Tooltip>
            </div>
        </article>
    );
};

export default CommunityPostCard;
