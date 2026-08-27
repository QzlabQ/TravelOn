UPDATE public.attraction
SET cover_image_url = CASE id
    WHEN 'f0000000-0000-4000-a000-000000000001'::uuid THEN '/community/defaults/featured-1.png'
    WHEN 'f0000000-0000-4000-a000-000000000002'::uuid THEN '/community/defaults/featured-2.png'
    WHEN 'f0000000-0000-4000-a000-000000000003'::uuid THEN '/community/defaults/featured-3.png'
    WHEN 'f0000000-0000-4000-a000-000000000004'::uuid THEN '/community/defaults/featured-4.png'
END
WHERE id IN (
    'f0000000-0000-4000-a000-000000000001'::uuid,
    'f0000000-0000-4000-a000-000000000002'::uuid,
    'f0000000-0000-4000-a000-000000000003'::uuid,
    'f0000000-0000-4000-a000-000000000004'::uuid
);

UPDATE public.attraction_images
SET image_url = CASE attraction_id
    WHEN 'f0000000-0000-4000-a000-000000000001'::uuid THEN '/community/defaults/featured-1.png'
    WHEN 'f0000000-0000-4000-a000-000000000002'::uuid THEN '/community/defaults/featured-2.png'
    WHEN 'f0000000-0000-4000-a000-000000000003'::uuid THEN '/community/defaults/featured-3.png'
    WHEN 'f0000000-0000-4000-a000-000000000004'::uuid THEN '/community/defaults/featured-4.png'
END
WHERE attraction_id IN (
    'f0000000-0000-4000-a000-000000000001'::uuid,
    'f0000000-0000-4000-a000-000000000002'::uuid,
    'f0000000-0000-4000-a000-000000000003'::uuid,
    'f0000000-0000-4000-a000-000000000004'::uuid
);