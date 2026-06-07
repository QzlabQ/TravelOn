export function formatDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-indexed
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

export function cateringToString (type: 'ALL_INCLUSIVE' | 'THREE_COURSES' | 'TWO_COURSES' | 'BREAKFAST' | 'NO_CATERING' | 'ACCORDING_TO_PROGRAMME',) {
    if (type === 'ALL_INCLUSIVE') return '全包';
    if (type === 'THREE_COURSES') return '三餐';
    if (type === 'TWO_COURSES') return '两餐';
    if (type === 'BREAKFAST') return '早餐';
    if (type === 'NO_CATERING') return '不含餐';
    if (type === 'ACCORDING_TO_PROGRAMME') return '按行程安排';
}
