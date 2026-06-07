import React, {useState} from "react";
import {
    Alert,
    Box,
    Button,
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
import {
    ApiRequests,
    CommunityCategory,
    CreateCommunityPostPayload,
    CreateCommunityReviewPayload,
    ReviewTargetType
} from "../../core/apiConfig";
import {categoryLabels, targetTypeLabels} from "./communityLabels";

type Props = {
    open: boolean,
    token?: string,
    onClose: () => void,
    onPublished: () => void,
};

const postCategories: CommunityCategory[] = ["TRAVEL_NOTE", "HOTEL", "FOOD", "TRANSPORT", "OTHER"];
const reviewCategories: CommunityCategory[] = ["SCENIC_SPOT", "ROUTE", "MERCHANT", "HOTEL", "FOOD", "OTHER"];
const targetTypes: ReviewTargetType[] = ["SCENIC_SPOT", "ROUTE", "MERCHANT", "HOTEL"];

const CommunityPublishDialog = ({open, token, onClose, onPublished}: Props) => {
    const [mode, setMode] = useState<"post" | "review">("post");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [postPayload, setPostPayload] = useState<CreateCommunityPostPayload>({
        title: "",
        content: "",
        category: "TRAVEL_NOTE",
        destination: "",
        imageUrls: [],
    });
    const [imageUrlText, setImageUrlText] = useState("");
    const [reviewPayload, setReviewPayload] = useState<CreateCommunityReviewPayload>({
        targetType: "SCENIC_SPOT",
        targetName: "",
        targetId: "",
        rating: 5,
        content: "",
        category: "SCENIC_SPOT",
    });

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
        setSubmitting(true);
        setError("");
        try {
            if (mode === "post") {
                await ApiRequests.createCommunityPost(token, {
                    ...postPayload,
                    imageUrls: imageUrlText.split("\n").map(item => item.trim()).filter(Boolean),
                });
            } else {
                await ApiRequests.createCommunityReview(token, reviewPayload);
            }
            onPublished();
            setError("");
            onClose();
        } catch (e) {
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
                    <Tab value="post" label="旅游分享"/>
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
                        <TextField
                            label="目的地"
                            value={postPayload.destination}
                            onChange={event => setPostPayload({...postPayload, destination: event.target.value})}
                            fullWidth
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
                                setReviewPayload({...reviewPayload, targetType, category: targetType === "SCENIC_SPOT" ? "SCENIC_SPOT" : targetType});
                            }}
                            select
                            fullWidth
                        >
                            {targetTypes.map(type => <MenuItem key={type} value={type}>{targetTypeLabels[type]}</MenuItem>)}
                        </TextField>
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
        </Dialog>
    );
};

export default CommunityPublishDialog;
