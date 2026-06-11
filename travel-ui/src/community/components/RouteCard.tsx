import React from "react";
import {Chip, Rating} from "@mui/material";
import {AttachMoney, CalendarMonth, Groups, Place, Route as RouteIcon} from "@mui/icons-material";
import {Link} from "react-router-dom";
import {resolveCommunityImageUrl, TravelRouteResponse} from "../../core/apiConfig";
import {formatCommunityTime, travelStyleLabels} from "./communityLabels";

type Props = {
    route: TravelRouteResponse,
};

const RouteCard = ({route}: Props) => (
    <Link
        to={`/community/routes/${route.id}`}
        className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
    >
        <div className="relative h-40 bg-slate-100">
            {route.coverImageUrl
                ? <img src={resolveCommunityImageUrl(route.coverImageUrl)} alt={route.title} className="h-full w-full object-cover"/>
                : <div className="flex h-full items-center justify-center text-slate-300"><RouteIcon sx={{fontSize: 48}}/></div>
            }
            <Chip
                size="small"
                label={travelStyleLabels[route.style]}
                className="!absolute left-3 top-3"
                sx={{bgcolor: "rgba(15,23,42,0.7)", color: "#fff", fontWeight: 600}}
            />
        </div>

        <div className="flex flex-1 flex-col p-4">
            <h3 className="line-clamp-1 text-base font-bold text-slate-950 group-hover:text-blue-600">{route.title}</h3>
            {route.city && (
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <Place sx={{fontSize: 14}}/>{route.city}
                </p>
            )}

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span className="flex items-center gap-1"><CalendarMonth sx={{fontSize: 15}}/>{route.days} 天</span>
                <span className="flex items-center gap-1"><Groups sx={{fontSize: 15}}/>{route.peopleCount} 人</span>
                <span className="flex items-center gap-1"><AttachMoney sx={{fontSize: 15}}/>¥{route.budget}/人</span>
                <span className="flex items-center gap-1"><RouteIcon sx={{fontSize: 15}}/>{route.stopCount} 个景点</span>
            </div>

            <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                    {route.reviewCount > 0
                        ? <><Rating value={route.averageRating} readOnly size="small" precision={0.1}/><span>{route.averageRating.toFixed(1)}</span></>
                        : <span className="text-slate-400">暂无评分</span>
                    }
                </span>
                <span className="truncate">{route.createdByName} · {formatCommunityTime(route.createdAt)}</span>
            </div>
        </div>
    </Link>
);

export default RouteCard;
