import React, {useCallback, useEffect, useState} from "react";
import {Dialog, IconButton} from "@mui/material";
import {ChevronLeft, ChevronRight, Close} from "@mui/icons-material";
import {resolveCommunityImageUrl} from "../../core/apiConfig";

/** Manages open state and the active image index for an {@link ImageLightbox}. */
export const useLightbox = () => {
    const [open, setOpen] = useState(false);
    const [index, setIndex] = useState(0);
    return {
        open,
        index,
        setIndex,
        openAt: (i: number) => {setIndex(i); setOpen(true);},
        close: () => setOpen(false),
    };
};

type Props = {
    images: string[],
    index: number,
    open: boolean,
    onClose: () => void,
    onIndexChange: (index: number) => void,
};

/**
 * Full-screen image preview. Accepts community-relative or absolute image
 * references and resolves them for display. Supports prev/next navigation
 * (arrow buttons + keyboard) when given multiple images.
 */
const ImageLightbox = ({images, index, open, onClose, onIndexChange}: Props) => {
    const total = images.length;
    const hasMultiple = total > 1;

    const showPrev = useCallback(() => {
        onIndexChange((index - 1 + total) % total);
    }, [index, total, onIndexChange]);

    const showNext = useCallback(() => {
        onIndexChange((index + 1) % total);
    }, [index, total, onIndexChange]);

    useEffect(() => {
        if (!open || !hasMultiple) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft") showPrev();
            if (e.key === "ArrowRight") showNext();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, hasMultiple, showPrev, showNext]);

    if (!open || total === 0) return null;
    const safeIndex = Math.min(Math.max(index, 0), total - 1);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth={false}
            slotProps={{backdrop: {sx: {bgcolor: "rgba(15,23,42,0.9)"}}}}
            PaperProps={{
                sx: {bgcolor: "transparent", boxShadow: "none", m: 0, maxWidth: "100vw", overflow: "visible"},
            }}
        >
            <div className="relative flex items-center justify-center" onClick={onClose}>
                <IconButton
                    onClick={onClose}
                    sx={{
                        position: "fixed", top: 16, right: 16, color: "#fff",
                        bgcolor: "rgba(15,23,42,0.5)", "&:hover": {bgcolor: "rgba(15,23,42,0.75)"},
                    }}
                >
                    <Close/>
                </IconButton>

                {hasMultiple && (
                    <IconButton
                        onClick={e => {e.stopPropagation(); showPrev();}}
                        sx={{
                            position: "fixed", left: 16, top: "50%", transform: "translateY(-50%)", color: "#fff",
                            bgcolor: "rgba(15,23,42,0.5)", "&:hover": {bgcolor: "rgba(15,23,42,0.75)"},
                        }}
                    >
                        <ChevronLeft fontSize="large"/>
                    </IconButton>
                )}

                <img
                    src={resolveCommunityImageUrl(images[safeIndex])}
                    alt=""
                    onClick={e => e.stopPropagation()}
                    className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
                />

                {hasMultiple && (
                    <IconButton
                        onClick={e => {e.stopPropagation(); showNext();}}
                        sx={{
                            position: "fixed", right: 16, top: "50%", transform: "translateY(-50%)", color: "#fff",
                            bgcolor: "rgba(15,23,42,0.5)", "&:hover": {bgcolor: "rgba(15,23,42,0.75)"},
                        }}
                    >
                        <ChevronRight fontSize="large"/>
                    </IconButton>
                )}

                {hasMultiple && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1 text-sm text-white">
                        {safeIndex + 1} / {total}
                    </div>
                )}
            </div>
        </Dialog>
    );
};

export default ImageLightbox;
