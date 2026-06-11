import React, {useEffect, useState} from "react";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField
} from "@mui/material";
import {ApiRequests, CreateCommunityPostPayload} from "../../core/apiConfig";
import CommunityImageUploader from "./CommunityImageUploader";

type Props = {
    open: boolean,
    token?: string,
    onClose: () => void,
    onPublished: () => void,
};

const defaultPayload: CreateCommunityPostPayload = {
    title: "",
    content: "",
    category: "TRAVEL_NOTE",
    destinationCityId: "",
    imageUrls: [],
};

const PostPublishDialog = ({open, token, onClose, onPublished}: Props) => {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [payload, setPayload] = useState<CreateCommunityPostPayload>(defaultPayload);
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

    const submit = async () => {
        if (!token) {
            setError("请先登录后再发布内容。");
            return;
        }
        if (!payload.title.trim() || !payload.content.trim()) {
            setError("标题和正文不能为空。");
            return;
        }

        setSubmitting(true);
        setError("");
        try {
            await ApiRequests.createCommunityPost(token, {
                title: payload.title.trim(),
                content: payload.content.trim(),
                category: "TRAVEL_NOTE",
                destinationCityId: payload.destinationCityId?.trim() || undefined,
                imageUrls: payload.imageUrls ?? [],
            });
            setPayload(defaultPayload);
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
            <DialogTitle>发布到广场</DialogTitle>
            <DialogContent dividers>
                {error && <Alert severity="error" className="mb-4">{error}</Alert>}
                <Box className="grid gap-4">
                    <TextField
                        label="标题"
                        value={payload.title}
                        onChange={event => setPayload({...payload, title: event.target.value})}
                        inputProps={{maxLength: 120}}
                        fullWidth
                        required
                    />
                    <Autocomplete
                        options={cityOptions}
                        getOptionLabel={o => o.label}
                        isOptionEqualToValue={(o, v) => o.cityId === v.cityId}
                        value={cityOptions.find(o => o.cityId === payload.destinationCityId) ?? null}
                        onChange={(_, value) => setPayload({...payload, destinationCityId: value?.cityId ?? ""})}
                        renderInput={params => (
                            <TextField {...params} label="目的地城市" fullWidth placeholder="请选择目的地城市（可选）"/>
                        )}
                        noOptionsText="无匹配城市"
                    />
                    <TextField
                        label="正文"
                        value={payload.content}
                        onChange={event => setPayload({...payload, content: event.target.value})}
                        multiline
                        minRows={6}
                        inputProps={{maxLength: 4000}}
                        fullWidth
                        required
                    />
                    <CommunityImageUploader
                        token={token}
                        value={payload.imageUrls ?? []}
                        onChange={urls => setPayload({...payload, imageUrls: urls})}
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
        </Dialog>
    );
};

export default PostPublishDialog;
