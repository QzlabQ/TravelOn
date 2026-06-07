import React from "react";
import {Button, Chip} from "@mui/material";
import {Favorite, FavoriteBorder, LocationOn} from "@mui/icons-material";
import {Link} from "react-router-dom";
import {CommunityPostResponse} from "../../core/apiConfig";
import {categoryLabels, formatCommunityTime} from "./communityLabels";

type Props = {
    post: CommunityPostResponse,
    onLike: (post: CommunityPostResponse) => void,
    canLike: boolean,
};

const CommunityPostCard = ({post, onLike, canLike}: Props) => {
    const coverImage = post.imageUrls?.[0];

    return (
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <Chip size="small" label={categoryLabels[post.category]} color="primary" variant="outlined"/>
                        {post.destination &&
                            <Chip size="small" icon={<LocationOn/>} label={post.destination}/>
                        }
                    </div>
                    <Link to={`/community/posts/${post.id}`}>
                        <h2 className="mt-3 text-2xl font-bold text-slate-950 hover:text-blue-600">{post.title}</h2>
                    </Link>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{post.content}</p>
                </div>
                {coverImage &&
                    <Link to={`/community/posts/${post.id}`} className="shrink-0">
                        <img src={coverImage} alt={post.title} className="h-28 w-40 rounded-lg object-cover"/>
                    </Link>
                }
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p className="text-sm text-slate-500">{post.authorName} · {formatCommunityTime(post.createdAt)}</p>
                <Button
                    size="small"
                    variant={post.likedByCurrentUser ? "contained" : "outlined"}
                    startIcon={post.likedByCurrentUser ? <Favorite/> : <FavoriteBorder/>}
                    onClick={() => onLike(post)}
                    color={post.likedByCurrentUser ? "error" : "primary"}
                >
                    {canLike ? `${post.likeCount}` : `登录后点赞 · ${post.likeCount}`}
                </Button>
            </div>
        </article>
    );
};

export default CommunityPostCard;
