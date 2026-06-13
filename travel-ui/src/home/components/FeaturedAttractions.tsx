import React, {useEffect, useState} from "react";
import {Place} from "@mui/icons-material";
import {Link} from "react-router-dom";
import {ApiRequests, AttractionDetailResponse, resolveCommunityImageUrl} from "../../core/apiConfig";
import {FEATURED_ATTRACTION_IDS} from "../../community/featuredAttractions";

/**
 * Home-page showcase of the four official built-in attractions. Fetches them by
 * their fixed ids and links each card to its community detail page.
 */
export default function FeaturedAttractions() {
    const [attractions, setAttractions] = useState<AttractionDetailResponse[]>([]);

    useEffect(() => {
        let cancelled = false;
        Promise.all(
            FEATURED_ATTRACTION_IDS.map(id =>
                ApiRequests.getAttraction(id).then(res => res.data).catch(() => null)),
        ).then(results => {
            if (cancelled) return;
            setAttractions(results.filter((item): item is AttractionDetailResponse => item !== null));
        });
        return () => { cancelled = true; };
    }, []);

    if (attractions.length === 0) return null;

    return (
        <section className="mt-28 w-full max-w-6xl pb-16">
            <div className="mb-6 text-center">
                <h2 className="text-3xl font-bold tracking-wide text-gray-900">热门景点推荐</h2>
                <p className="mt-2 text-gray-600">官方精选，开启你的下一段旅程</p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {attractions.map(attraction => (
                    <Link
                        key={attraction.id}
                        to={`/community/attractions/${attraction.id}`}
                        state={{returnTo: "/", returnLabel: "返回首页"}}
                        className="group flex flex-col"
                    >
                        <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-100 shadow-sm">
                            {attraction.coverImageUrl
                                ? <img
                                    src={resolveCommunityImageUrl(attraction.coverImageUrl)}
                                    alt={attraction.name}
                                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                                />
                                : <div className="flex h-full items-center justify-center text-slate-300">
                                    <Place sx={{fontSize: 48}}/>
                                </div>
                            }
                        </div>
                        <h3 className="mt-3 text-lg font-bold text-slate-900 group-hover:text-blue-600">
                            {attraction.name}
                        </h3>
                        {attraction.city && (
                            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                                <Place sx={{fontSize: 15}}/>{attraction.city}
                            </p>
                        )}
                    </Link>
                ))}
            </div>
        </section>
    );
}
