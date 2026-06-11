import React, {useRef, useState} from "react";
import {Button, CircularProgress, IconButton} from "@mui/material";
import {AddPhotoAlternate, Close} from "@mui/icons-material";
import {ApiRequests, resolveCommunityImageUrl} from "../../core/apiConfig";
import ImageLightbox, {useLightbox} from "./ImageLightbox";

type Props = {
    token?: string,
    value: string[],
    onChange: (urls: string[]) => void,
    max?: number,
    disabled?: boolean,
};

const CommunityImageUploader = ({token, value, onChange, max = 6, disabled}: Props) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const lightbox = useLightbox();

    const remaining = max - value.length;

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        if (!token) {
            setError("请先登录后再上传图片。");
            return;
        }
        setError("");
        setUploading(true);
        try {
            const selected = Array.from(files).slice(0, remaining);
            const uploaded: string[] = [];
            for (const file of selected) {
                if (!file.type.startsWith("image/")) continue;
                const response = await ApiRequests.uploadCommunityImage(token, file);
                uploaded.push(response.data.url);
            }
            if (uploaded.length > 0) {
                onChange([...value, ...uploaded]);
            }
        } catch {
            setError("图片上传失败，请稍后重试。");
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const removeAt = (index: number) => {
        onChange(value.filter((_, i) => i !== index));
    };

    return (
        <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">图片（最多 {max} 张）</p>
            <div className="flex flex-wrap gap-3">
                {value.map((url, index) => (
                    <div key={url} className="relative h-24 w-24 overflow-hidden rounded-lg border border-slate-200">
                        <img
                            src={resolveCommunityImageUrl(url)}
                            alt=""
                            onClick={() => lightbox.openAt(index)}
                            className="h-full w-full cursor-zoom-in object-cover"
                        />
                        <IconButton
                            size="small"
                            onClick={() => removeAt(index)}
                            disabled={disabled || uploading}
                            sx={{
                                position: "absolute", top: 2, right: 2, p: "2px",
                                bgcolor: "rgba(15,23,42,0.6)", color: "#fff",
                                "&:hover": {bgcolor: "rgba(15,23,42,0.8)"}
                            }}
                        >
                            <Close sx={{fontSize: 16}}/>
                        </IconButton>
                    </div>
                ))}
                {remaining > 0 &&
                    <Button
                        variant="outlined"
                        component="label"
                        disabled={disabled || uploading}
                        sx={{height: 96, width: 96, minWidth: 96, flexDirection: "column", gap: 0.5, borderStyle: "dashed", color: "text.secondary"}}
                    >
                        {uploading ? <CircularProgress size={20}/> : <AddPhotoAlternate/>}
                        <span style={{fontSize: 12}}>{uploading ? "上传中" : "上传"}</span>
                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            hidden
                            onChange={event => handleFiles(event.target.files)}
                        />
                    </Button>
                }
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <ImageLightbox
                images={value}
                index={lightbox.index}
                open={lightbox.open}
                onClose={lightbox.close}
                onIndexChange={lightbox.setIndex}
            />
        </div>
    );
};

export default CommunityImageUploader;
