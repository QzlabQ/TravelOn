import {
    PlannerPlaceSuggestion,
    PlannerRouteSegment,
} from "../core/apiConfig";

export interface MockPlannerViewData {
    title: string,
    summary: string,
    markdown: string,
    places: PlannerPlaceSuggestion[],
    routes: PlannerRouteSegment[],
    selectedPlaceIds: string[],
}

const mockPlaces: PlannerPlaceSuggestion[] = [
    {
        placeId: "mock-shanghai-bund",
        name: "外滩",
        type: "SCENIC",
        source: "AMAP",
        amapPoiId: "mock-amap-bund",
        latitude: 31.2397,
        longitude: 121.4998,
        address: "上海市黄浦区中山东一路",
        description: "适合作为第一天傍晚的城市地标和江景步行段。",
        selected: true,
        tags: ["江景", "地标", "步行"],
    },
    {
        placeId: "mock-shanghai-museum",
        name: "上海博物馆",
        type: "SCENIC",
        source: "AMAP",
        amapPoiId: "mock-amap-museum",
        latitude: 31.2304,
        longitude: 121.4705,
        address: "上海市黄浦区人民大道201号",
        description: "适合安排在上午，和人民广场周边动线连贯。",
        selected: true,
        tags: ["文化", "室内", "亲子"],
    },
    {
        placeId: "mock-shanghai-yuyuan",
        name: "豫园",
        type: "SCENIC",
        source: "AMAP",
        amapPoiId: "mock-amap-yuyuan",
        latitude: 31.2273,
        longitude: 121.4921,
        address: "上海市黄浦区福佑路168号",
        description: "适合连接城隍庙和本帮菜午餐，注意避开高峰时段。",
        selected: false,
        tags: ["园林", "老城厢", "美食"],
    },
    {
        placeId: "mock-shanghai-wukang",
        name: "武康路",
        type: "SCENIC",
        source: "AMAP",
        amapPoiId: "mock-amap-wukang-road",
        latitude: 31.2135,
        longitude: 121.4387,
        address: "上海市徐汇区武康路",
        description: "适合下午慢走，保留咖啡和街区拍照时间。",
        selected: false,
        tags: ["citywalk", "街区", "咖啡"],
    },
    {
        placeId: "mock-shanghai-hotel",
        name: "人民广场附近酒店",
        type: "HOTEL",
        source: "AI",
        latitude: 31.2334,
        longitude: 121.4757,
        address: "上海市黄浦区人民广场商圈",
        description: "模拟住宿点，方便前端验证酒店和路线关系。",
        selected: false,
        tags: ["住宿", "地铁", "模拟"],
    },
];

const mockRoutes: PlannerRouteSegment[] = [
    {
        fromPlaceId: "mock-shanghai-hotel",
        toPlaceId: "mock-shanghai-museum",
        transportMode: "步行",
        distanceKm: 0.8,
        estimatedMinutes: 12,
        summary: "酒店 -> 上海博物馆，步行约 12 分钟",
    },
    {
        fromPlaceId: "mock-shanghai-museum",
        toPlaceId: "mock-shanghai-yuyuan",
        transportMode: "地铁/步行",
        distanceKm: 2.8,
        estimatedMinutes: 24,
        summary: "上海博物馆 -> 豫园，公共交通约 24 分钟",
    },
    {
        fromPlaceId: "mock-shanghai-yuyuan",
        toPlaceId: "mock-shanghai-bund",
        transportMode: "步行",
        distanceKm: 1.4,
        estimatedMinutes: 20,
        summary: "豫园 -> 外滩，步行约 20 分钟",
    },
];

export function buildMockPlannerViewData(city: string): MockPlannerViewData {
    const normalizedCity = city.trim() || "上海";
    return {
        title: `${normalizedCity} 模拟地图联调`,
        summary: "这是一组前端联调用模拟点位和路线，可直接验证地图、推荐列表和选点刷新。",
        markdown: [
            `# ${normalizedCity} 三日模拟行程`,
            "",
            "## 第 1 天",
            "- 上午：从人民广场附近酒店出发，步行到上海博物馆。",
            "- 中午：前往豫园和老城厢周边用餐。",
            "- 傍晚：从豫园步行到外滩，看黄浦江两岸夜景。",
            "",
            "## 第 2 天",
            "- 下午安排武康路 citywalk，保留咖啡和街区拍照时间。",
            "",
            "## 地图说明",
            "- 当前点位和路线为模拟数据，用于阶段 5 前端地图组件联调。",
        ].join("\n"),
        places: mockPlaces,
        routes: mockRoutes,
        selectedPlaceIds: mockPlaces.filter(place => place.selected).map(place => place.placeId),
    };
}

