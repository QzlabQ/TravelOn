import {
    canCancelReservation,
    canPayReservation,
    getEffectiveReservationStatus,
    getPaymentDeadlineMillis,
    isReservationPaymentExpired,
} from '../../../src/reservations/orderStatus';
import {ReservationResponse} from '../../../src/core/apiConfig';

const reservation = (overrides: Partial<ReservationResponse> = {}): ReservationResponse => ({
    id: 'reservation-1',
    userId: 'user-1',
    title: 'Trip',
    status: 'PENDING_PAYMENT',
    paid: false,
    price: 100,
    createdAt: '2026-06-15T10:00:00',
    hotelTimeFrom: '2026-07-01T00:00:00',
    hotelTimeTo: '2026-07-02T00:00:00',
    adultsQuantity: 1,
    childrenUnder3Quantity: 0,
    childrenUnder10Quantity: 0,
    childrenUnder18Quantity: 0,
    bookingType: 'HOTEL',
    roomReservationsIds: [],
    transportReservationsIds: [],
    travelers: [],
    ...overrides,
});

describe('reservation status rules', () => {
    test('uses explicit payment deadline and expires pending payment at the boundary', () => {
        const item = reservation({paymentDeadline: '2026-06-15T10:30:00'});
        const deadline = getPaymentDeadlineMillis(item);
        expect(deadline).toBe(new Date('2026-06-15T10:30:00Z').getTime());
        expect(isReservationPaymentExpired(item, deadline)).toBe(true);
        expect(getEffectiveReservationStatus(item, [], deadline)).toBe('EXPIRED');
        expect(canPayReservation(item)).toBe(false);
    });

    test('paid and refund state take precedence over an expired deadline', () => {
        const paid = reservation({paid: true, paidAt: '2026-06-15T10:05:00', paymentDeadline: '2026-06-15T10:01:00'});
        expect(isReservationPaymentExpired(paid, Date.parse('2026-06-15T10:30:00Z'))).toBe(false);
        expect(getEffectiveReservationStatus(paid, [])).toBe('PAID');
        expect(canCancelReservation(paid)).toBe(true);

        const refunding = reservation({status: 'REFUND_PROCESSING'});
        expect(getEffectiveReservationStatus(refunding, [{status: 'PROCESSING'} as never])).toBe('REFUNDED');
        expect(canPayReservation(refunding, [])).toBe(false);
        expect(canCancelReservation(refunding, [])).toBe(false);
    });
});
