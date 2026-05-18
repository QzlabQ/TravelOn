export function formatDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-indexed
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

export function cateringToString (type: 'ALL_INCLUSIVE' | 'THREE_COURSES' | 'TWO_COURSES' | 'BREAKFAST' | 'NO_CATERING' | 'ACCORDING_TO_PROGRAMME',) {
    if (type === 'ALL_INCLUSIVE') return 'All inclusive';
    if (type === 'THREE_COURSES') return 'Trzy dania';
    if (type === 'TWO_COURSES') return 'Dwa dania';
    if (type === 'BREAKFAST') return 'Śniadanie';
    if (type === 'NO_CATERING') return 'Bez cateringu';
    if (type === 'ACCORDING_TO_PROGRAMME') return 'Zgodnie z programem';
}
