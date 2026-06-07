import React from "react";
import {Chip, Rating} from "@mui/material";
import {RateReview} from "@mui/icons-material";
import {CommunityReviewResponse} from "../../core/apiConfig";
import {categoryLabels, formatCommunityTime, targetTypeLabels} from "./communityLabels";

type Props = {
    review: CommunityReviewResponse,
};

const CommunityReviewCard = ({review}: Props) => {
    return (
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
                <Chip size="small" icon={<RateReview/>} label={`${targetTypeLabels[review.targetType]} · ${review.targetName}`} color="secondary" variant="outlined"/>
                <Chip size="small" label={categoryLabels[review.category]}/>
            </div>
            <div className="mt-3 flex items-center gap-3">
                <Rating value={review.rating} readOnly size="small"/>
                <span className="text-sm font-semibold text-slate-700">{review.rating}.0</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{review.content}</p>
            <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-500">
                {review.authorName} · {formatCommunityTime(review.createdAt)}
            </p>
        </article>
    );
};

export default CommunityReviewCard;
