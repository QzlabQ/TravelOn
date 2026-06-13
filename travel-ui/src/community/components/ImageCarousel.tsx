import React, {useState} from "react";
import {IconButton} from "@mui/material";
import {ChevronLeft, ChevronRight} from "@mui/icons-material";
import {resolveCommunityImageUrl} from "../../core/apiConfig";
import ImageLightbox, {useLightbox} from "./ImageLightbox";

type Props = {
    images: string[],
    alt?: string,
};

/**
 * Paged image viewer: shows one image at a time with prev/next controls, a
 * counter and dot indicators. Clicking an image opens the fullscreen
 * {@link ImageLightbox}.
 */
const ImageCarousel = ({images, alt}: Props) => {
    const [index, setIndex] = useState(0);
    const lightbox = useLightbox();

    if (images.length === 0) return null;
    const safeIndex = Math.min(index, images.length - 1);
    const hasMultiple = images.length > 1;
    const go = (next: number) => setIndex((next + images.length) % images.length);

    const arrowSx = {
        position: "absolute" as const, top: "50%", transform: "translateY(-50%)", color: "#fff",
        bgcolor: "rgba(15,23,42,0.5)", "&:hover": {bgcolor: "rgba(15,23,42,0.7)"},
    };

    return (
        <div className="relative bg-slate-900">
            <img
                src={resolveCommunityImageUrl(images[safeIndex])}
                alt={alt}
                onClick={() => lightbox.openAt(safeIndex)}
                className="h-[420px] w-full cursor-zoom-in object-contain md:h-[520px]"
            />

            {hasMultiple && (
                <>
                    <IconButton onClick={() => go(safeIndex - 1)} sx={{...arrowSx, left: 8}}>
                        <ChevronLeft/>
                    </IconButton>
                    <IconButton onClick={() => go(safeIndex + 1)} sx={{...arrowSx, right: 8}}>
                        <ChevronRight/>
                    </IconButton>

                    <div className="absolute right-3 top-3 rounded-full bg-black/50 px-2.5 py-0.5 text-xs text-white">
                        {safeIndex + 1} / {images.length}
                    </div>

                    <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                        {images.map((url, i) => (
                            <button
                                key={url}
                                onClick={() => setIndex(i)}
                                aria-label={`查看第 ${i + 1} 张`}
                                className={`h-1.5 rounded-full transition-all ${i === safeIndex ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"}`}
                            />
                        ))}
                    </div>
                </>
            )}

            <ImageLightbox
                images={images}
                index={lightbox.index}
                open={lightbox.open}
                onClose={lightbox.close}
                onIndexChange={lightbox.setIndex}
            />
        </div>
    );
};

export default ImageCarousel;
