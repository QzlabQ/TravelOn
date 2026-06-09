import React from "react";
import {Avatar, Chip, Rating} from "@mui/material";
import {RateReview} from "@mui/icons-material";
import {CommunityReviewResponse} from "../../core/apiConfig";
import {categoryLabels, formatCommunityTime, targetTypeLabels} from "./communityLabels";

type Props = {
    review: CommunityReviewResponse,
};

const CommunityReviewCard = ({review}: Props) => {
    const authorInitial = review.authorName?.trim()?.slice(0, 1) || "评";

    return (
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-amber-200 hover:shadow-md">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <Chip
                            size="small"
                            icon={<RateReview fontSize="small"/>}
                            label={`${targetTypeLabels[review.targetType]} · ${review.targetName}`}
                            color="secondary"
                            variant="outlined"
                            sx={{maxWidth: 260, "& .MuiChip-label": {overflow: "hidden", textOverflow: "ellipsis"}}}
                        />
                        <Chip size="small" label={categoryLabels[review.category]}/>
                    </div>
                    <h3 className="mt-3 line-clamp-1 text-lg font-bold text-slate-950">{review.targetName}</h3>
                </div>

                <div className="rounded-lg bg-amber-50 px-3 py-2 text-center">
                    <p className="text-lg font-bold text-amber-700">{review.rating}.0</p>
                    <p className="text-xs text-amber-700">评分</p>
                </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
                <Rating value={review.rating} readOnly size="small"/>
            </div>

            <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-600">{review.content}</p>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500">
                <Avatar sx={{width: 28, height: 28, fontSize: 14}}>{authorInitial}</Avatar>
                <span className="font-medium text-slate-700">{review.authorName}</span>
                <span>{formatCommunityTime(review.createdAt)}</span>
            </div>
        </article>
    );
};

export default CommunityReviewCard;
