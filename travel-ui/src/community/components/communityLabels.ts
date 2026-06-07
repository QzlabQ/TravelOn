import {CommunityCategory, ReviewTargetType} from "../../core/apiConfig";

export const categoryLabels: Record<CommunityCategory, string> = {
    TRAVEL_NOTE: "旅游分享",
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
};

export const formatCommunityTime = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};
