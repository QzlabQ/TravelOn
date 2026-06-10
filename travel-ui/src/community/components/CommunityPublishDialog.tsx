import React, {useEffect, useState} from "react";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    Rating,
    Tab,
    Tabs,
    TextField
} from "@mui/material";
import {Landscape} from "@mui/icons-material";
import {
    ApiRequests,
    AttractionResponse,
    CommunityCategory,
    CreateCommunityPostPayload,
    CreateCommunityReviewPayload,
    ReviewTargetType
} from "../../core/apiConfig";
import {categoryLabels, targetTypeLabels} from "./communityLabels";
import AttractionPickerDialog from "./AttractionPickerDialog";

type Props = {
    open: boolean,
    token?: string,
    onClose: () => void,
    onPublished: () => void,
};

const postCategories: CommunityCategory[] = ["TRAVEL_NOTE", "HOTEL", "FOOD", "TRANSPORT", "OTHER"];
const reviewCategories: CommunityCategory[] = ["SCENIC_SPOT", "ROUTE", "MERCHANT", "HOTEL", "FOOD", "OTHER"];
const targetTypes: ReviewTargetType[] = ["SCENIC_SPOT", "ROUTE", "MERCHANT", "HOTEL"];

const defaultPostPayload: CreateCommunityPostPayload = {
    title: "",
    content: "",
    category: "TRAVEL_NOTE",
    destinationCityId: "",
    imageUrls: [],
};

const defaultReviewPayload: CreateCommunityReviewPayload = {
    targetType: "SCENIC_SPOT",
    targetName: "",
    targetId: "",
    rating: 5,
    content: "",
    category: "SCENIC_SPOT",
};

const CommunityPublishDialog = ({open, token, onClose, onPublished}: Props) => {
    const [mode, setMode] = useState<"post" | "review">("post");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [postPayload, setPostPayload] = useState<CreateCommunityPostPayload>(defaultPostPayload);
    const [imageUrlText, setImageUrlText] = useState("");
    const [reviewPayload, setReviewPayload] = useState<CreateCommunityReviewPayload>(defaultReviewPayload);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickedAttraction, setPickedAttraction] = useState<AttractionResponse | null>(null);
    const [cityOptions, setCityOptions] = useState<{cityId: string, label: string}[]>([]);

    useEffect(() => {
        if (!open || cityOptions.length > 0) return;
        ApiRequests.getHotelDestinations()
            .then(res => {
                const seen = new Set<string>();
                const opts = res.data
                    .filter(d => d.cityId && d.region)
                    .filter(d => { if (seen.has(d.cityId)) return false; seen.add(d.cityId); return true; })
                    .map(d => ({cityId: d.cityId, label: d.region}))
                    .sort((a, b) => a.label.localeCompare(b.label, "zh"));
                setCityOptions(opts);
            })
            .catch(() => {});
    }, [open, cityOptions.length]);

    const closeDialog = () => {
        if (!submitting) {
            setError("");
            onClose();
        }
    };

    const resetForm = () => {
        setPostPayload(defaultPostPayload);
        setReviewPayload(defaultReviewPayload);
        setImageUrlText("");
        setPickedAttraction(null);
    };

    const submit = async () => {
        if (!token) {
            setError("请先登录后再发布内容。");
            return;
        }

        if (mode === "post" && (!postPayload.title.trim() || !postPayload.content.trim())) {
            setError("标题和正文不能为空。");
            return;
        }

        if (mode === "review") {
            if (reviewPayload.targetType === "SCENIC_SPOT" && !pickedAttraction) {
                setError("请先选择一个景点。");
                return;
            }
            if (reviewPayload.targetType !== "SCENIC_SPOT" && !reviewPayload.targetName.trim()) {
                setError("评价对象不能为空。");
                return;
            }
            if (!reviewPayload.content.trim()) {
                setError("评价内容不能为空。");
                return;
            }
        }

        setSubmitting(true);
        setError("");
        try {
            if (mode === "post") {
                await ApiRequests.createCommunityPost(token, {
                    title: postPayload.title.trim(),
                    content: postPayload.content.trim(),
                    category: postPayload.category,
                    destinationCityId: postPayload.destinationCityId?.trim() || undefined,
                    imageUrls: imageUrlText.split("\n").map(item => item.trim()).filter(Boolean),
                });
            } else if (reviewPayload.targetType === "SCENIC_SPOT" && pickedAttraction) {
                // Route through attraction-specific endpoint for accurate aggregation
                await ApiRequests.createAttractionReview(token, pickedAttraction.id, {
                    rating: reviewPayload.rating,
                    content: reviewPayload.content.trim(),
                });
            } else {
                await ApiRequests.createCommunityReview(token, {
                    ...reviewPayload,
                    targetName: reviewPayload.targetName.trim(),
                    targetId: reviewPayload.targetId?.trim() || undefined,
                    content: reviewPayload.content.trim(),
                });
            }
            resetForm();
            onPublished();
            onClose();
        } catch {
            setError("发布失败，请检查内容或稍后重试。");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={closeDialog} fullWidth maxWidth="md">
            <DialogTitle>发布社区内容</DialogTitle>
            <DialogContent dividers>
                {error && <Alert severity="error" className="mb-4">{error}</Alert>}
                <Tabs value={mode} onChange={(_, value) => setMode(value)} className="mb-4">
                    <Tab value="post" label="旅行分享"/>
                    <Tab value="review" label="写评价"/>
                </Tabs>

                {mode === "post" ?
                    <Box className="grid gap-4">
                        <TextField
                            label="标题"
                            value={postPayload.title}
                            onChange={event => setPostPayload({...postPayload, title: event.target.value})}
                            inputProps={{maxLength: 120}}
                            fullWidth
                            required
                        />
                        <TextField
                            label="分类"
                            value={postPayload.category}
                            onChange={event => setPostPayload({...postPayload, category: event.target.value as CommunityCategory})}
                            select
                            fullWidth
                        >
                            {postCategories.map(category => <MenuItem key={category} value={category}>{categoryLabels[category]}</MenuItem>)}
                        </TextField>
                        <Autocomplete
                            options={cityOptions}
                            getOptionLabel={o => o.label}
                            isOptionEqualToValue={(o, v) => o.cityId === v.cityId}
                            value={cityOptions.find(o => o.cityId === postPayload.destinationCityId) ?? null}
                            onChange={(_, value) => setPostPayload({...postPayload, destinationCityId: value?.cityId ?? ""})}
                            renderInput={params => (
                                <TextField {...params} label="目的地城市" fullWidth placeholder="请选择目的地城市（可选）"/>
                            )}
                            noOptionsText="无匹配城市"
                        />
                        <TextField
                            label="正文"
                            value={postPayload.content}
                            onChange={event => setPostPayload({...postPayload, content: event.target.value})}
                            multiline
                            minRows={6}
                            inputProps={{maxLength: 4000}}
                            fullWidth
                            required
                        />
                        <TextField
                            label="图片 URL，每行一个"
                            value={imageUrlText}
                            onChange={event => setImageUrlText(event.target.value)}
                            multiline
                            minRows={3}
                            fullWidth
                        />
                    </Box>
                    :
                    <Box className="grid gap-4">
                        <TextField
                            label="评价对象类型"
                            value={reviewPayload.targetType}
                            onChange={event => {
                                const targetType = event.target.value as ReviewTargetType;
                                setReviewPayload({...reviewPayload, targetType, category: targetType as CommunityCategory});
                                setPickedAttraction(null);
                            }}
                            select
                            fullWidth
                        >
                            {targetTypes.map(type => <MenuItem key={type} value={type}>{targetTypeLabels[type]}</MenuItem>)}
                        </TextField>

                        {reviewPayload.targetType === "SCENIC_SPOT" ? (
                            <div>
                                <p className="mb-1 text-sm font-semibold text-slate-700">选择景点</p>
                                {pickedAttraction ? (
                                    <div className="flex items-center gap-2">
                                        <Chip
                                            icon={<Landscape/>}
                                            label={pickedAttraction.city ? `${pickedAttraction.name} · ${pickedAttraction.city}` : pickedAttraction.name}
                                            color="primary"
                                            variant="outlined"
                                            onDelete={() => setPickedAttraction(null)}
                                        />
                                    </div>
                                ) : (
                                    <Button
                                        variant="outlined"
                                        startIcon={<Landscape/>}
                                        onClick={() => setPickerOpen(true)}
                                        fullWidth
                                    >
                                        从景点目录中选择
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <>
                                <TextField
                                    label="对象名称"
                                    value={reviewPayload.targetName}
                                    onChange={event => setReviewPayload({...reviewPayload, targetName: event.target.value})}
                                    fullWidth
                                    required
                                />
                                <TextField
                                    label="对象 ID（可选）"
                                    value={reviewPayload.targetId}
                                    onChange={event => setReviewPayload({...reviewPayload, targetId: event.target.value})}
                                    fullWidth
                                />
                            </>
                        )}

                        <TextField
                            label="分类"
                            value={reviewPayload.category}
                            onChange={event => setReviewPayload({...reviewPayload, category: event.target.value as CommunityCategory})}
                            select
                            fullWidth
                        >
                            {reviewCategories.map(category => <MenuItem key={category} value={category}>{categoryLabels[category]}</MenuItem>)}
                        </TextField>
                        <div>
                            <p className="mb-2 text-sm font-semibold text-slate-700">评分</p>
                            <Rating
                                value={reviewPayload.rating}
                                onChange={(_, value) => setReviewPayload({...reviewPayload, rating: value ?? 5})}
                            />
                        </div>
                        <TextField
                            label="评价内容"
                            value={reviewPayload.content}
                            onChange={event => setReviewPayload({...reviewPayload, content: event.target.value})}
                            multiline
                            minRows={5}
                            inputProps={{maxLength: 2000}}
                            fullWidth
                            required
                        />
                    </Box>
                }
            </DialogContent>
            <DialogActions>
                <Button onClick={closeDialog} disabled={submitting}>取消</Button>
                <Button onClick={submit} variant="contained" disabled={submitting}>
                    {submitting ? "发布中" : "发布"}
                </Button>
            </DialogActions>

            <AttractionPickerDialog
                open={pickerOpen}
                token={token}
                onPick={attraction => {
                    setPickedAttraction(attraction);
                    setPickerOpen(false);
                }}
                onClose={() => setPickerOpen(false)}
            />
        </Dialog>
    );
};

export default CommunityPublishDialog;
