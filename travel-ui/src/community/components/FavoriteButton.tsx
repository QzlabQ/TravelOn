import React, {useEffect, useState} from "react";
import {Button, Snackbar} from "@mui/material";
import {Bookmark, BookmarkBorder} from "@mui/icons-material";
import {ApiRequests, FavoriteTargetType} from "../../core/apiConfig";
import {useAuthSession} from "../../core/useAuthSession";

type Props = {
    type: FavoriteTargetType,
    targetId: string,
    initialFavorited?: boolean,
    fullWidth?: boolean,
    onChange?: (favorited: boolean) => void,
};

const FavoriteButton = ({type, targetId, initialFavorited = false, fullWidth = false, onChange}: Props) => {
    const session = useAuthSession();
    const [favorited, setFavorited] = useState(initialFavorited);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState("");

    useEffect(() => {
        setFavorited(initialFavorited);
    }, [initialFavorited, targetId]);

    const toggle = async () => {
        if (!session) {
            setToast("请先登录后再收藏");
            return;
        }

        const previous = favorited;
        const optimistic = !previous;
        setFavorited(optimistic);
        onChange?.(optimistic);
        setSaving(true);
        try {
            const response = await ApiRequests.toggleFavorite(session.token, {type, targetId});
            setFavorited(response.data.favorited);
            onChange?.(response.data.favorited);
        } catch {
            setFavorited(previous);
            onChange?.(previous);
            setToast("收藏操作失败，请稍后重试");
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Button
                fullWidth={fullWidth}
                variant={favorited ? "contained" : "outlined"}
                color={favorited ? "warning" : "primary"}
                startIcon={favorited ? <Bookmark/> : <BookmarkBorder/>}
                onClick={toggle}
                disabled={saving}
            >
                {favorited ? "已收藏" : "收藏"}
            </Button>
            <Snackbar
                open={Boolean(toast)}
                autoHideDuration={2200}
                onClose={() => setToast("")}
                message={toast}
                anchorOrigin={{vertical: "top", horizontal: "center"}}
            />
        </>
    );
};

export default FavoriteButton;
