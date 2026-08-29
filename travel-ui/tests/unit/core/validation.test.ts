import {
    normalizeChinaMainlandPhone,
    normalizeDigits,
    validateBankCard,
    validateChinaMainlandPhone,
    validateRechargeAmount,
    validateStayDates,
    validateTicketTravelerRules,
} from '../../../src/core/validation';

const residentId = (birthDate: string, sequence = '001') => {
    const body = `110105${birthDate.replace(/-/g, '')}${sequence}`;
    const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    const codes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
    const checksum = body.split('').reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0);
    return body + codes[checksum % 11];
};

describe('validation business rules', () => {
    test('normalizes digits and mainland phone prefixes', () => {
        expect(normalizeDigits(' 138-0013-8000 ')).toBe('13800138000');
        expect(normalizeChinaMainlandPhone('+86 138 0013 8000')).toBe('13800138000');
        expect(validateChinaMainlandPhone('13800138000', true)).toBe('');
        expect(validateChinaMainlandPhone('120', true)).not.toBe('');
    });

    test('accepts a valid UnionPay Luhn number and rejects invalid cards', () => {
        expect(validateBankCard('6222021234567894')).toBe('');
        expect(validateBankCard('4111111111111111')).not.toBe('');
        expect(validateBankCard('6222021234567891')).not.toBe('');
    });

    test('validates recharge amount boundaries', () => {
        expect(validateRechargeAmount('10')).toBe('');
        expect(validateRechargeAmount('9')).not.toBe('');
        expect(validateRechargeAmount('50001')).not.toBe('');
    });

    test('requires valid future-ordered stay dates', () => {
        const today = new Date(2026, 5, 15);
        expect(validateStayDates('2026-06-15', '2026-06-16', today)).toBe('');
        expect(validateStayDates('2026-06-14', '2026-06-16', today)).not.toBe('');
        expect(validateStayDates('2026-06-16', '2026-06-16', today)).not.toBe('');
    });

    test('requires an adult or student companion for children and enforces transport age rules', () => {
        const child = {
            name: 'Child',
            travelerType: 'CHILD' as const,
            documentNumber: residentId('2015-01-01'),
        };
        const adult = {name: 'Adult', travelerType: 'ADULT' as const};
        expect(validateTicketTravelerRules([child])).not.toBe('');
        expect(validateTicketTravelerRules([child, adult], {transportType: 'FLIGHT', departureDate: '2026-06-01'})).toBe('');
        expect(validateTicketTravelerRules([{...child, documentNumber: residentId('2000-01-01')}, adult], {transportType: 'TRAIN', departureDate: '2026-06-01'})).not.toBe('');
        expect(validateTicketTravelerRules([adult], {studentOnly: true})).not.toBe('');
    });
});
