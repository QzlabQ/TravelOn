import React, {useState} from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Rating,
    TextField
} from "@mui/material";
import {Landscape} from "@mui/icons-material";
import {ApiRequests, AttractionResponse, CommunityCategory, ReviewTargetType} from "../../core/apiConfig";
import {targetTypeLabels} from "./communityLabels";
import AttractionPickerDialog from "./AttractionPickerDialog";
import CommunityImageUploader from "./CommunityImageUploader";

type Props = {
    open: boolean,
    token?: string,
    targetType: ReviewTargetType,
    onClose: () => void,
    onPublished: () => void,
};

const ReviewPublishDialog = ({open, token, targetType, onClose, onPublished}: Props) => {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [rating, setRating] = useState(5);
    const [content, setContent] = useState("");
    const [targetName, setTargetName] = useState("");
    const [targetId, setTargetId] = useState("");
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickedAttraction, setPickedAttraction] = useState<AttractionResponse | null>(null);

    const isAttraction = targetType === "SCENIC_SPOT";

    const resetForm = () => {
        setRating(5);
        setContent("");
        setTargetName("");
        setTargetId("");
        setImageUrls([]);
        setPickedAttraction(null);
    };

    const closeDialog = () => {
        if (!submitting) {
            setError("");
            onClose();
        }
    };

    const submit = async () => {
        if (!token) {
            setError("请先登录后再发布内容。");
            return;
        }
        if (isAttraction && !pickedAttraction) {
            setError("请先选择一个景点。");
            return;
        }
        if (!isAttraction && !targetName.trim()) {
            setError("评价对象不能为空。");
            return;
        }
        if (!content.trim()) {
            setError("评价内容不能为空。");
            return;
        }

        setSubmitting(true);
        setError("");
        try {
            if (isAttraction && pickedAttraction) {
                // Route through attraction-specific endpoint for accurate aggregation
                await ApiRequests.createAttractionReview(token, pickedAttraction.id, {
                    rating,
                    content: content.trim(),
                    imageUrls,
                });
            } else {
                await ApiRequests.createCommunityReview(token, {
                    targetType,
                    targetName: targetName.trim(),
                    targetId: targetId.trim() || undefined,
                    rating,
                    content: content.trim(),
                    category: targetType as CommunityCategory,
                    imageUrls,
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
            <DialogTitle>发布{targetTypeLabels[targetType]}评价</DialogTitle>
            <DialogContent dividers>
                {error && <Alert severity="error" className="mb-4">{error}</Alert>}
                <Box className="grid gap-4">
                    {isAttraction ? (
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
                                value={targetName}
                                onChange={event => setTargetName(event.target.value)}
                                fullWidth
                                required
                            />
                            <TextField
                                label="对象 ID（可选）"
                                value={targetId}
                                onChange={event => setTargetId(event.target.value)}
                                fullWidth
                            />
                        </>
                    )}

                    <div>
                        <p className="mb-2 text-sm font-semibold text-slate-700">评分</p>
                        <Rating value={rating} onChange={(_, value) => setRating(value ?? 5)}/>
                    </div>
                    <TextField
                        label="评价内容"
                        value={content}
                        onChange={event => setContent(event.target.value)}
                        multiline
                        minRows={5}
                        inputProps={{maxLength: 2000}}
                        fullWidth
                        required
                    />
                    <CommunityImageUploader
                        token={token}
                        value={imageUrls}
                        onChange={setImageUrls}
                        disabled={submitting}
                    />
                </Box>
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

export default ReviewPublishDialog;
