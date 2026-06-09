import {CommunityCategory, ReviewTargetType} from "../../core/apiConfig";

export const categoryLabels: Record<CommunityCategory, string> = {
    TRAVEL_NOTE: "旅行分享",
    SCENIC_SPOT: "景点评价",
    ROUTE: "路线评价",
    MERCHANT: "商家评价",
    HOTEL: "酒店",
    FOOD: "美食",
    TRANSPORT: "交通",
    OTHER: "其他",
};

export const targetTypeLabels: Record<ReviewTargetType, string> = {
    SCENIC_SPOT: "景点",
    ROUTE: "路线",
    MERCHANT: "商家",
    HOTEL: "酒店",
};

export const formatCommunityTime = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const diffMs = Date.now() - date.getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diffMs >= 0 && diffMs < minute) return "刚刚";
    if (diffMs >= 0 && diffMs < hour) return `${Math.floor(diffMs / minute)} 分钟前`;
    if (diffMs >= 0 && diffMs < day) return `${Math.floor(diffMs / hour)} 小时前`;

    return date.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
};
