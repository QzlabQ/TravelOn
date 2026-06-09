import {BookingPersonPayload} from "./apiConfig";

const RESIDENT_ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const RESIDENT_ID_CHECK_CODES = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];

type SupportedTransportType = "FLIGHT" | "TRAIN";

type BankCardPrefixInfo = {
    prefixes: string[];
    bankName: string;
    cardBrand: string;
    cardType: string;
};

export type ResidentIdInfo = {
    birthDate: string;
    age: number;
};

export type BankCardIssuerInfo = {
    bankName: string;
    cardBrand: string;
    cardType: string;
    displayName: string;
};

const BANK_CARD_PREFIXES: BankCardPrefixInfo[] = [
    {prefixes: ["622202"], bankName: "中国工商银行", cardBrand: "银联", cardType: "借记卡"},
    {prefixes: ["622848"], bankName: "中国农业银行", cardBrand: "银联", cardType: "借记卡"},
    {prefixes: ["621661", "621660"], bankName: "中国银行", cardBrand: "银联", cardType: "借记卡"},
    {prefixes: ["621700"], bankName: "中国建设银行", cardBrand: "银联", cardType: "借记卡"},
    {prefixes: ["622262"], bankName: "交通银行", cardBrand: "银联", cardType: "借记卡"},
    {prefixes: ["622588", "622575"], bankName: "招商银行", cardBrand: "银联", cardType: "借记卡"},
    {prefixes: ["622666", "622622"], bankName: "中国光大银行", cardBrand: "银联", cardType: "借记卡"},
];

export const normalizeDigits = (value?: string | null) => (value ?? "").replace(/\D/g, "");

export const normalizeChinaMainlandPhone = (value?: string | null) => {
    let digits = normalizeDigits(value);
    if (digits.length === 13 && digits.startsWith("86")) {
        digits = digits.slice(2);
    }
    return digits;
};

export const normalizeDocumentNumber = (documentType?: string | null, documentNumber?: string | null) => {
    const normalizedType = (documentType ?? "身份证").trim() || "身份证";
    const normalizedNumber = (documentNumber ?? "").trim();
    return normalizedType === "身份证" ? normalizedNumber.toUpperCase() : normalizedNumber;
};

const parseDateInput = (value?: string | null) => {
    if (!value) return null;

    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    date.setHours(0, 0, 0, 0);
    return date;
};

const getTodayStart = (today = new Date()) => {
    const normalized = new Date(today);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
};

const formatDatePart = (value: number) => value.toString().padStart(2, "0");

const formatDateLabel = (date: Date) => {
    return `${date.getFullYear()}-${formatDatePart(date.getMonth() + 1)}-${formatDatePart(date.getDate())}`;
};

const calculateAge = (birthDate: Date, referenceDate = new Date()) => {
    let age = referenceDate.getFullYear() - birthDate.getFullYear();
    const birthdayPassed = (
        referenceDate.getMonth() > birthDate.getMonth() ||
        (referenceDate.getMonth() === birthDate.getMonth() && referenceDate.getDate() >= birthDate.getDate())
    );
    if (!birthdayPassed) {
        age -= 1;
    }
    return age;
};

const parseChineseResidentIdBirthDate = (normalizedId: string) => {
    if (!/^\d{17}[\dX]$/.test(normalizedId)) {
        return null;
    }

    const birthday = normalizedId.slice(6, 14);
    const year = Number(birthday.slice(0, 4));
    const month = Number(birthday.slice(4, 6));
    const day = Number(birthday.slice(6, 8));
    const birthDate = new Date(year, month - 1, day);

    if (
        birthDate.getFullYear() !== year ||
        birthDate.getMonth() !== month - 1 ||
        birthDate.getDate() !== day
    ) {
        return null;
    }

    birthDate.setHours(0, 0, 0, 0);
    return birthDate;
};

const resolveCardBrand = (cardNumber: string) => {
    if (cardNumber.startsWith("62")) return "银联";
    return "银联";
};

const isUnionPayCard = (cardNumber: string) => cardNumber.startsWith("62");

const passesLuhn = (digits: string) => {
    let sum = 0;
    let shouldDouble = false;

    for (let index = digits.length - 1; index >= 0; index -= 1) {
        let digit = Number(digits[index]);
        if (shouldDouble) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }
        sum += digit;
        shouldDouble = !shouldDouble;
    }

    return sum % 10 === 0;
};

export const validateChinaMainlandPhone = (value?: string | null, required = false) => {
    const normalizedPhone = normalizeChinaMainlandPhone(value);
    if (!normalizedPhone) {
        return required ? "请输入手机号。" : "";
    }
    if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) {
        return "请输入有效的 11 位中国大陆手机号。";
    }
    return "";
};

export const validateChineseResidentId = (value?: string | null) => {
    const normalizedId = normalizeDocumentNumber("身份证", value);
    if (!normalizedId) {
        return "请输入身份证号。";
    }
    if (!/^\d{17}[\dX]$/.test(normalizedId)) {
        return "请输入有效的 18 位居民身份证号。";
    }

    const birthDate = parseChineseResidentIdBirthDate(normalizedId);
    if (!birthDate) {
        return "身份证号中的出生日期无效。";
    }

    const age = calculateAge(birthDate);
    if (age < 0) {
        return "身份证号中的出生日期不能晚于今天。";
    }
    if (age > 120) {
        return "身份证号中的出生日期超出合理范围。";
    }

    const checksum = RESIDENT_ID_WEIGHTS.reduce((sum, weight, index) => {
        return sum + Number(normalizedId[index]) * weight;
    }, 0);
    const expectedCode = RESIDENT_ID_CHECK_CODES[checksum % 11];

    if (normalizedId[17] !== expectedCode) {
        return "身份证号校验位不正确。";
    }

    return "";
};

export const getChineseResidentIdInfo = (value?: string | null, referenceDate = new Date()): ResidentIdInfo | null => {
    const normalizedId = normalizeDocumentNumber("身份证", value);
    if (validateChineseResidentId(normalizedId)) {
        return null;
    }

    const birthDate = parseChineseResidentIdBirthDate(normalizedId);
    if (!birthDate) {
        return null;
    }

    return {
        birthDate: formatDateLabel(birthDate),
        age: calculateAge(birthDate, referenceDate),
    };
};

export const validateDocumentNumber = (documentType?: string | null, documentNumber?: string | null, required = false) => {
    const normalizedType = (documentType ?? "身份证").trim() || "身份证";
    const normalizedNumber = normalizeDocumentNumber(normalizedType, documentNumber);

    if (!normalizedNumber) {
        return required ? `请输入${normalizedType === "身份证" ? "身份证号" : `${normalizedType}号码`}。` : "";
    }

    if (normalizedType === "身份证") {
        return validateChineseResidentId(normalizedNumber);
    }

    if (normalizedNumber.length < 6 || normalizedNumber.length > 48) {
        return `${normalizedType}号码需为 6-48 位。`;
    }

    if (/\s/.test(normalizedNumber)) {
        return `${normalizedType}号码不能包含空格。`;
    }

    return "";
};

export const validateBankCard = (value?: string | null) => {
    const cardNumber = normalizeDigits(value);
    if (!cardNumber) {
        return "请输入银联卡号。";
    }
    if (!/^\d{16,19}$/.test(cardNumber)) {
        return "请输入 16-19 位银联卡号。";
    }
    if (!isUnionPayCard(cardNumber)) {
        return "当前仅支持银联卡。";
    }
    if (!passesLuhn(cardNumber)) {
        return "银联卡号校验未通过，请检查后重试。";
    }
    return "";
};

export const normalizeCardExpiry = (value?: string | null) => {
    const digits = normalizeDigits(value).slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

export const validateCardExpiry = (value?: string | null, now = new Date()) => {
    const normalized = normalizeCardExpiry(value);
    if (!normalized) {
        return "请输入有效期。";
    }

    const match = normalized.match(/^(\d{2})\/(\d{2})$/);
    if (!match) {
        return "请输入有效的卡片有效期（MM/YY）。";
    }

    const month = Number(match[1]);
    const year = Number(match[2]);
    if (month < 1 || month > 12) {
        return "请输入有效的卡片月份。";
    }

    const currentYear = now.getFullYear() % 100;
    const currentMonth = now.getMonth() + 1;
    if (year < currentYear || (year === currentYear && month < currentMonth)) {
        return "该银行卡已过有效期。";
    }

    return "";
};

export const validateCardSecurityCode = (value?: string | null) => {
    const code = normalizeDigits(value);
    if (!code) {
        return "请输入安全码。";
    }
    if (!/^\d{3,4}$/.test(code)) {
        return "安全码需为 3-4 位数字。";
    }
    return "";
};

export const validateRechargeAmount = (
    value?: string | number | null,
    options: {min?: number; max?: number} = {}
) => {
    const min = options.min ?? 10;
    const max = options.max ?? 50000;
    const rawValue = typeof value === "number" ? String(value) : (value ?? "").trim();

    if (!rawValue) {
        return "请输入充值金额。";
    }
    if (!/^\d+(\.\d{1,2})?$/.test(rawValue)) {
        return "充值金额最多支持 2 位小数。";
    }

    const amount = Number(rawValue);
    if (!Number.isFinite(amount)) {
        return "请输入有效的充值金额。";
    }
    if (amount < min) {
        return `单笔充值至少 ${min} 元。`;
    }
    if (amount > max) {
        return `单笔充值不能超过 ${max} 元。`;
    }
    return "";
};

export const getBankCardIssuerInfo = (value?: string | null): BankCardIssuerInfo | null => {
    const cardNumber = normalizeDigits(value);
    if (cardNumber.length < 4) {
        return null;
    }

    const matchedPrefix = BANK_CARD_PREFIXES.find(item =>
        item.prefixes.some(prefix => cardNumber.startsWith(prefix))
    );

    if (matchedPrefix) {
        return {
            ...matchedPrefix,
            displayName: `${matchedPrefix.bankName} · ${matchedPrefix.cardBrand}${matchedPrefix.cardType}`,
        };
    }

    const cardBrand = resolveCardBrand(cardNumber);
    return {
        bankName: "暂未识别归属行",
        cardBrand,
        cardType: "借记卡",
        displayName: `${cardBrand} · 暂未识别归属行`,
    };
};

export const validateStayDates = (dateFrom?: string | null, dateTo?: string | null, today = new Date()) => {
    const checkInDate = parseDateInput(dateFrom);
    const checkOutDate = parseDateInput(dateTo);

    if (!checkInDate || !checkOutDate) {
        return "请选择完整且有效的入住和离店日期。";
    }

    const todayStart = getTodayStart(today);
    if (checkInDate < todayStart) {
        return "入住日期不能早于今天。";
    }
    if (checkOutDate <= checkInDate) {
        return "离店日期需晚于入住日期。";
    }
    return "";
};

export const validateTicketTravelerRules = (
    travelers: BookingPersonPayload[],
    options: {
        studentOnly?: boolean;
        transportType?: SupportedTransportType;
        departureDate?: string | null;
    } = {}
) => {
    if (travelers.length === 0) {
        return "";
    }

    const departureDate = parseDateInput(options.departureDate) ?? getTodayStart();
    const childCount = travelers.filter(traveler => traveler.travelerType === "CHILD").length;
    if (childCount > 0 && childCount === travelers.length) {
        return "儿童出行需至少添加 1 位成人或学生同行。";
    }

    for (const traveler of travelers.filter(item => item.travelerType === "CHILD")) {
        if ((traveler.documentType ?? "身份证") !== "身份证") {
            return `${traveler.name || "儿童乘客"}需填写有效身份证号以自动校验年龄。`;
        }

        const residentIdInfo = getChineseResidentIdInfo(traveler.documentNumber, departureDate);
        if (!residentIdInfo) {
            return `${traveler.name || "儿童乘客"}需填写有效身份证号以自动校验年龄。`;
        }

        if (options.transportType === "FLIGHT") {
            if (residentIdInfo.age < 2) {
                return `${traveler.name || "该乘客"}出发当天未满 2 周岁，需按婴儿票规则预订。`;
            }
            if (residentIdInfo.age >= 12) {
                return `${traveler.name || "该乘客"}出发当天已满 12 周岁，请改用成人票或学生票。`;
            }
            continue;
        }

        if (residentIdInfo.age >= 14) {
            return `${traveler.name || "该乘客"}出发当天已满 14 周岁，请改用成人票或学生票。`;
        }
    }

    if (options.studentOnly) {
        if (travelers.some(traveler => traveler.travelerType !== "STUDENT")) {
            return "学生票仅支持学生类型的出行人预订。";
        }
    }

    return "";
};
