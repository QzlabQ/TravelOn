import React from "react";
import {Chip, Rating} from "@mui/material";
import {AttachMoney, CalendarMonth, Groups, Place, Route as RouteIcon} from "@mui/icons-material";
import {Link} from "react-router-dom";
import {resolveCommunityImageUrl, TravelRouteResponse} from "../../core/apiConfig";
import {formatCommunityTime, travelStyleLabels} from "./communityLabels";

type Props = {
    route: TravelRouteResponse,
    /** Optional router state so the detail page can navigate back to where this card was shown. */
    state?: {returnTo?: string, returnLabel?: string},
};

const RouteCard = ({route, state}: Props) => (
    <Link
        to={`/community/routes/${route.id}`}
        state={state}
        className="group grid overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md md:h-56 md:grid-cols-[280px_minmax(0,1fr)]"
    >
        <div className="relative h-48 overflow-hidden bg-slate-100 md:h-full">
            {route.coverImageUrl ? (
                <img
                    src={resolveCommunityImageUrl(route.coverImageUrl)}
                    alt={route.title}
                    className="absolute left-0 top-1/2 h-[130%] w-full -translate-y-1/2 object-cover"
                    style={{objectPosition: "50% 55%"}}
                />
            ) : (
                <div className="flex h-full items-center justify-center text-slate-300">
                    <RouteIcon sx={{fontSize: 48}}/>
                </div>
            )}
            <Chip
                size="small"
                label={travelStyleLabels[route.style]}
                className="!absolute left-3 top-3"
                sx={{bgcolor: "rgba(15,23,42,0.7)", color: "#fff", fontWeight: 600}}
            />
        </div>

        <div className="flex min-w-0 flex-1 flex-col p-5">
            <h3 className="line-clamp-2 text-xl font-bold leading-7 text-slate-950 group-hover:text-blue-600">
                {route.title}
            </h3>
            {route.city && (
                <p className="mt-2 flex items-center gap-1 text-sm text-slate-500">
                    <Place sx={{fontSize: 14}}/>{route.city}
                </p>
            )}

            <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                <span className="flex items-center gap-1"><CalendarMonth sx={{fontSize: 15}}/>{route.days} 天</span>
                <span className="flex items-center gap-1"><Groups sx={{fontSize: 15}}/>{route.peopleCount} 人</span>
                <span className="flex items-center gap-1"><AttachMoney sx={{fontSize: 15}}/>¥{route.budget}/人</span>
                <span className="flex items-center gap-1"><RouteIcon sx={{fontSize: 15}}/>{route.stopCount} 个景点</span>
            </div>

            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                    {route.reviewCount > 0 ? (
                        <>
                            <Rating value={route.averageRating} readOnly size="small" precision={0.1}/>
                            <span>{route.averageRating.toFixed(1)}</span>
                        </>
                    ) : (
                        <span className="text-slate-400">暂无评分</span>
                    )}
                </span>
                <span className="truncate">{route.createdByName} · {formatCommunityTime(route.createdAt)}</span>
            </div>
        </div>
    </Link>
);

export default RouteCard;
