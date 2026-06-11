import React from "react";
import {Avatar, Button, Chip, Tooltip} from "@mui/material";
import {ArrowForward, Favorite, FavoriteBorder, ImageOutlined, LocationOn} from "@mui/icons-material";
import {Link} from "react-router-dom";
import {CommunityPostResponse, resolveCommunityImageUrl} from "../../core/apiConfig";
import {categoryLabels, formatCommunityTime} from "./communityLabels";

type Props = {
    post: CommunityPostResponse,
    onLike: (post: CommunityPostResponse) => void,
    canLike: boolean,
};

const CommunityPostCard = ({post, onLike, canLike}: Props) => {
    const coverImage = post.imageUrls?.[0];
    const authorInitial = post.authorName?.trim()?.slice(0, 1) || "旅";

    return (
        <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md">
            <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_180px]">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <Chip size="small" label={categoryLabels[post.category]} color="primary" variant="outlined"/>
                        {post.destination &&
                            <Chip
                                size="small"
                                icon={<LocationOn fontSize="small"/>}
                                label={post.destination}
                                sx={{maxWidth: 220, "& .MuiChip-label": {overflow: "hidden", textOverflow: "ellipsis"}}}
                            />
                        }
                    </div>

                    <Link to={`/community/posts/${post.id}`} className="group mt-3 block">
                        <h2 className="line-clamp-2 text-xl font-bold leading-7 text-slate-950 group-hover:text-blue-600">
                            {post.title}
                        </h2>
                    </Link>

                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{post.content}</p>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                        <Avatar sx={{width: 28, height: 28, fontSize: 14}}>{authorInitial}</Avatar>
                        <span className="font-medium text-slate-700">{post.authorName}</span>
                        <span>{formatCommunityTime(post.createdAt)}</span>
                    </div>
                </div>

                <Link to={`/community/posts/${post.id}`} className="block h-36 overflow-hidden rounded-lg bg-slate-100 md:h-full">
                    {coverImage ?
                        <img src={resolveCommunityImageUrl(coverImage)} alt={post.title} className="h-full w-full object-cover transition duration-300 hover:scale-105"/>
                        :
                        <div className="flex h-full min-h-36 items-center justify-center text-slate-400">
                            <ImageOutlined fontSize="large"/>
                        </div>
                    }
                </Link>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
                <Link to={`/community/posts/${post.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700">
                    查看详情 <ArrowForward fontSize="small"/>
                </Link>
                <Tooltip title={canLike ? "点赞这篇分享" : "登录后可以点赞"}>
                    <span>
                        <Button
                            size="small"
                            variant={post.likedByCurrentUser ? "contained" : "outlined"}
                            startIcon={post.likedByCurrentUser ? <Favorite/> : <FavoriteBorder/>}
                            onClick={() => onLike(post)}
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
