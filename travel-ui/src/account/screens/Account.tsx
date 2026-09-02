import React, {useEffect, useMemo, useRef, useState} from "react";
import {
    Alert,
    Avatar,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    FormControlLabel,
    InputAdornment,
    LinearProgress,
    MenuItem,
    Paper,
    Rating,
    Switch,
    Tab,
    Tabs,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography
} from "@mui/material";
import {
    AccountCircle,
    Badge,
    Bookmarks,
    CloudUpload,
    CreditCard,
    Delete,
    Edit,
    Email,
    Logout,
    Phone,
    Save,
    PersonAdd,
    TravelExplore
} from "@mui/icons-material";
import {Link, useNavigate} from "react-router-dom";
import AuthDialog from "../components/AuthDialog";
import {
    clearCurrentUserSession,
    getBookingPreferences,
    getCurrentUserSession,
    setBookingPreferences,
    updateCurrentUserProfile,
    BookingPreferences,
    UserProfile,
    UserSession
} from "../../core/currentUser";
import {AccountIdentity, ApiRequests, resolveCommunityImageUrl, SavedBankCard, TravelerPayload, TravelerResponse, TravelerType} from "../../core/apiConfig";
import {
    getChineseResidentIdInfo,
    normalizeChinaMainlandPhone,
    normalizeDocumentNumber,
    validateChinaMainlandPhone,
    validateDocumentNumber,
    getBankCardIssuerInfo,
    normalizeDigits,
    validateBankCard
} from "../../core/validation";

const emptyProfileForm = {
    name: "",
    surname: "",
    email: "",
    phone: "",
    avatarUrl: ""
};

const isUploadedAvatarPath = (value?: string | null) => Boolean(value?.startsWith("/community/uploads/"));

const emptyIdentityForm: AccountIdentity = {
    realName: "",
    documentType: "身份证",
    documentNumber: ""
};

const emptyTravelerForm: TravelerPayload = {
    name: "",
    travelerType: "ADULT",
    documentType: "身份证",
    documentNumber: "",
    phone: "",
    student: false,
    defaultTraveler: false
};

const trainTypeOptions = [
    {label: "G/C 高铁城际", value: "GC"},
    {label: "D 动车", value: "D"},
    {label: "T 特快", value: "T"},
    {label: "K 快速", value: "K"},
    {label: "Z 直达", value: "Z"},
    {label: "其他", value: "OTHER"},
];

const documentTypeOptions = ["身份证", "护照", "港澳通行证", "台胞证", "其他"];

const maskValue = (value?: string, visibleStart = 3, visibleEnd = 4) => {
    if (!value) return "";
    if (value.length <= visibleStart + visibleEnd) return value.replace(/.(?=.{1})/g, "*");
    return `${value.slice(0, visibleStart)}${"*".repeat(Math.max(3, value.length - visibleStart - visibleEnd))}${value.slice(-visibleEnd)}`;
};

const validateTraveler = (traveler: TravelerPayload) => {
    if (!traveler.name.trim()) return "请填写出行人姓名。";
    if (traveler.name.trim().length > 80) return "姓名不能超过 80 个字符。";
    if ((traveler.documentType?.trim().length || 0) > 24) return "证件类型不能超过 24 个字符。";
    const documentError = validateDocumentNumber(traveler.documentType, traveler.documentNumber, true);
    if (documentError) return documentError;
    const phoneError = validateChinaMainlandPhone(traveler.phone, false);
    if (phoneError) return phoneError;
    return "";
};

const normalizeTravelerPayload = (traveler: TravelerPayload): TravelerPayload => ({
    name: traveler.name.trim(),
    travelerType: traveler.travelerType || "ADULT",
    documentType: traveler.documentType?.trim() || undefined,
    documentNumber: normalizeDocumentNumber(traveler.documentType, traveler.documentNumber) || undefined,
    phone: normalizeChinaMainlandPhone(traveler.phone) || undefined,
    student: traveler.travelerType === "STUDENT" ? true : Boolean(traveler.student),
    defaultTraveler: Boolean(traveler.defaultTraveler),
});

const extractApiErrorMessage = (error: any, fallback: string) => {
    const responseMessage = error?.response?.data?.message || error?.response?.data?.error || error?.message;
    return responseMessage ? `${fallback}（${responseMessage}）` : fallback;
};

export default function Account() {
    const navigate = useNavigate();
    const [session, setSession] = useState<UserSession | null>(getCurrentUserSession());
    const [profileForm, setProfileForm] = useState(emptyProfileForm);
    const [avatarInput, setAvatarInput] = useState("");
    const [authOpen, setAuthOpen] = useState(false);
    const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [travelers, setTravelers] = useState<TravelerResponse[]>([]);
    const [travelerForm, setTravelerForm] = useState<TravelerPayload>(emptyTravelerForm);
    const [editingTravelerId, setEditingTravelerId] = useState("");
    const [travelerEditorOpen, setTravelerEditorOpen] = useState(false);
    const [bookingPreferences, setBookingPreferencesForm] = useState<BookingPreferences>(getBookingPreferences());
    const [identityForm, setIdentityForm] = useState<AccountIdentity>(emptyIdentityForm);
    const [identityMessage, setIdentityMessage] = useState("");
    const [identityErrorMessage, setIdentityErrorMessage] = useState("");
    const [savedBankCards, setSavedBankCards] = useState<SavedBankCard[]>([]);
    const [bankCardNumber, setBankCardNumber] = useState('');
    const [bankCardLabel, setBankCardLabel] = useState('');
    const [activeTab, setActiveTab] = useState<"profile" | "travel">("profile");
    const [avatarUploading, setAvatarUploading] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const profilePhoneError = validateChinaMainlandPhone(profileForm.phone, false);
    const identityDocumentError = validateDocumentNumber(identityForm.documentType, identityForm.documentNumber, false);
    const travelerDocumentError = validateDocumentNumber(travelerForm.documentType, travelerForm.documentNumber, false);
    const travelerPhoneError = validateChinaMainlandPhone(travelerForm.phone, false);
    const identityResidentInfo = identityForm.documentType === "身份证" ? getChineseResidentIdInfo(identityForm.documentNumber) : null;
    const travelerResidentInfo = travelerForm.documentType === "身份证" ? getChineseResidentIdInfo(travelerForm.documentNumber) : null;

    const profile = session?.user;
    const identityVerified = Boolean(identityForm.realName.trim() && !validateDocumentNumber(identityForm.documentType, identityForm.documentNumber, true));

    const initials = useMemo(() => {
        if (!profile) return "TC";
        return `${profile.name?.[0] || ""}${profile.surname?.[0] || ""}`.toUpperCase() || "TC";
    }, [profile]);

    const syncProfileForm = (user: UserProfile) => {
        setProfileForm({
            name: user.name || "",
            surname: user.surname || "",
            email: user.email || "",
            phone: user.phone || "",
            avatarUrl: user.avatarUrl || ""
        });
        setAvatarInput(isUploadedAvatarPath(user.avatarUrl) ? "" : user.avatarUrl || "");
    };

    const refreshProfile = async (currentSession = session) => {
        if (!currentSession) return;
        setLoading(true);
        setErrorMessage("");

        try {
            const response = await ApiRequests.getCurrentUser(currentSession.token);
            const nextSession = {...currentSession, user: response.data};
            updateCurrentUserProfile(response.data);
            setSession(nextSession);
            syncProfileForm(response.data);
        } catch (e) {
            setErrorMessage("登录状态已失效，请重新登录。");
            clearCurrentUserSession();
            setSession(null);
        } finally {
            setLoading(false);
        }
    };

    const loadTravelers = async (currentSession = session) => {
        if (!currentSession) return;
        try {
            const response = await ApiRequests.listTravelers(currentSession.token);
            setTravelers(response.data);
        } catch {
            setErrorMessage("常用出行人读取失败，请稍后再试。");
        }
    };

    const loadAccountAssets = async (currentSession = session) => {
        if (!currentSession) {
            setIdentityForm(emptyIdentityForm);
            setSavedBankCards([]);
            return;
        }
        try {
            const [identityResponse, bankCardsResponse] = await Promise.all([
                ApiRequests.getAccountIdentity(currentSession.token),
                ApiRequests.listSavedBankCards(currentSession.token)
            ]);
            setIdentityForm(identityResponse.status === 204 ? emptyIdentityForm : identityResponse.data);
            setSavedBankCards(bankCardsResponse.data);
        } catch {
            setIdentityErrorMessage("实名信息或银联卡读取失败，请稍后再试。");
        }
    };

    useEffect(() => {
        if (profile) {
            syncProfileForm(profile);
            refreshProfile().then(r => r);
            loadTravelers().then(r => r);
            loadAccountAssets().then(r => r);
        }
    }, []);

    const handleAuthenticated = (nextSession: UserSession) => {
        setSession(nextSession);
        syncProfileForm(nextSession.user);
        setMessage("登录成功，欢迎回来。");
        setErrorMessage("");
        loadAccountAssets(nextSession).then(r => r);
        loadTravelers(nextSession).then(r => r);
    };

    const saveProfile = async () => {
        if (!session) return;
        if (profilePhoneError) {
            setErrorMessage(profilePhoneError);
            return;
        }
        setSaving(true);
        setMessage("");
        setErrorMessage("");

        try {
            const response = await ApiRequests.updateCurrentUser(session.token, {
                ...profileForm,
                name: profileForm.name.trim(),
                surname: "",
                phone: normalizeChinaMainlandPhone(profileForm.phone) || ""
            });
            const nextSession = {...session, user: response.data};
            updateCurrentUserProfile(response.data);
            setSession(nextSession);
            setMessage("账户资料已更新。");
        } catch (e: any) {
            if (e?.response?.status === 409) {
                setErrorMessage("这个邮箱已被其他账户使用。");
            } else {
                setErrorMessage("保存失败，请稍后再试。");
            }
        } finally {
            setSaving(false);
        }
    };

    const uploadAvatar = async (file: File | undefined) => {
        if (!file || !session) return;
        if (!file.type.startsWith("image/")) {
            setErrorMessage("请选择图片文件。");
            return;
        }

        setAvatarUploading(true);
        setMessage("");
        setErrorMessage("");
        try {
            const response = await ApiRequests.uploadCommunityImage(session.token, file);
            setProfileForm(current => ({...current, avatarUrl: response.data.url}));
            setAvatarInput("");
            setMessage("头像已上传，请点击保存资料完成更新。");
        } catch (error: any) {
            setErrorMessage(extractApiErrorMessage(error, "头像上传失败，请稍后再试。"));
        } finally {
            setAvatarUploading(false);
            if (avatarInputRef.current) {
                avatarInputRef.current.value = "";
            }
        }
    };

    const logout = async () => {
        if (session) {
            try {
                await ApiRequests.logout(session.token);
            } catch (e) {
                console.log(e);
            }
        }
        clearCurrentUserSession();
        setSession(null);
        setProfileForm(emptyProfileForm);
        setAvatarInput("");
        setIdentityForm(emptyIdentityForm);
        setIdentityMessage("");
        setIdentityErrorMessage("");
        navigate("/");
    };

    const openCreateTraveler = () => {
        setEditingTravelerId("");
        setTravelerForm(emptyTravelerForm);
        setTravelerEditorOpen(true);
    };

    const openCreateSelfTraveler = () => {
        if (!profile) return;

        setEditingTravelerId("");
        setTravelerForm({
            ...emptyTravelerForm,
            name: identityForm.realName || `${profile.name || ""}${profile.surname ? ` ${profile.surname}` : ""}`.trim(),
            documentType: identityForm.documentType || "身份证",
            documentNumber: identityForm.documentNumber || "",
            phone: profile.phone || "",
            defaultTraveler: travelers.length === 0,
        });
        setTravelerEditorOpen(true);
    };

    const openEditTraveler = (traveler: TravelerResponse) => {
        setEditingTravelerId(traveler.id);
        setTravelerForm({
            name: traveler.name || "",
            travelerType: traveler.travelerType || "ADULT",
            documentType: traveler.documentType || "身份证",
            documentNumber: traveler.documentNumber || "",
            phone: traveler.phone || "",
            student: Boolean(traveler.student),
            defaultTraveler: Boolean(traveler.defaultTraveler)
        });
        setMessage("");
        setErrorMessage("");
        setTravelerEditorOpen(true);
    };

    const saveTraveler = async () => {
        if (!session) return;
        const payload = normalizeTravelerPayload(travelerForm);
        const validationError = validateTraveler(payload);
        if (validationError) {
            setErrorMessage(validationError);
            return;
        }

        setSaving(true);
        setErrorMessage("");
        try {
            if (editingTravelerId) {
                await ApiRequests.updateTraveler(session.token, editingTravelerId, payload);
            } else {
                await ApiRequests.createTraveler(session.token, payload);
            }
            setTravelerEditorOpen(false);
            setMessage(editingTravelerId ? "常用出行人已更新。" : "常用出行人已添加。");
            await loadTravelers();
        } catch (error: any) {
            setErrorMessage(extractApiErrorMessage(error, "常用出行人保存失败，请检查填写内容。"));
        } finally {
            setSaving(false);
        }
    };

    const updateBookingPreference = <K extends keyof BookingPreferences>(key: K, value: BookingPreferences[K]) => {
        setBookingPreferencesForm(previous => ({...previous, [key]: value}));
    };

    const togglePreferredTrainType = (value: string) => {
        setBookingPreferencesForm(previous => {
            const nextTypes = previous.preferredTrainTypes.includes(value)
                ? previous.preferredTrainTypes.filter(item => item !== value)
                : [...previous.preferredTrainTypes, value];
            return {...previous, preferredTrainTypes: nextTypes};
        });
    };

    const savePreferences = () => {
        const normalizedPreferences = setBookingPreferences(bookingPreferences);
        setBookingPreferencesForm(normalizedPreferences);
        setMessage("预订偏好已保存，下次查询会自动应用。");
        setErrorMessage("");
    };

    const saveIdentity = async () => {
        if (!session) return;
        const normalizedIdentity = {
            realName: identityForm.realName.trim(),
            documentType: identityForm.documentType.trim() || "身份证",
            documentNumber: normalizeDocumentNumber(identityForm.documentType, identityForm.documentNumber),
        };

        if (!normalizedIdentity.realName) {
            setIdentityErrorMessage("请填写真实姓名。");
            return;
        }
        const documentError = validateDocumentNumber(normalizedIdentity.documentType, normalizedIdentity.documentNumber, true);
        if (documentError) {
            setIdentityErrorMessage(documentError);
            return;
        }

        setSaving(true);
        setIdentityMessage("");
        setIdentityErrorMessage("");
        try {
            const response = await ApiRequests.saveAccountIdentity(session.token, normalizedIdentity);
            setIdentityForm(response.data);
            setIdentityMessage("实名信息已保存，后续支付会自动带入。");
        } catch (error: any) {
            setIdentityErrorMessage(extractApiErrorMessage(error, "实名信息保存失败，请稍后再试。"));
        } finally {
            setSaving(false);
        }
    };

    const addBankCard = async () => {
        if (!session) return;
        const normalizedNumber = normalizeDigits(bankCardNumber);
        const cardError = validateBankCard(normalizedNumber);
        if (cardError) {
            setErrorMessage(cardError);
            return;
        }

        setSaving(true);
        setErrorMessage("");
        try {
            const response = await ApiRequests.saveBankCard(session.token, {cardNumber: normalizedNumber, label: bankCardLabel});
            setSavedBankCards(previous => previous.some(card => card.id === response.data.id) ? previous : [response.data, ...previous]);
            setBankCardNumber('');
            setBankCardLabel('');
            setMessage("银联卡已保存，支付时可以直接选择。");
        } catch {
            setErrorMessage("银联卡保存失败，请稍后再试。");
        } finally {
            setSaving(false);
        }
    };

    const deleteBankCard = async (cardId: string) => {
        if (!session) return;
        setSaving(true);
        setErrorMessage("");
        try {
            await ApiRequests.deleteBankCard(session.token, cardId);
            setSavedBankCards(previous => previous.filter(card => card.id !== cardId));
            setMessage("已删除保存的银联卡。");
        } catch {
            setErrorMessage("银联卡删除失败，请稍后再试。");
        } finally {
            setSaving(false);
        }
    };

    const deleteTraveler = async (travelerId: string) => {
        if (!session) return;
        setErrorMessage("");
        try {
            await ApiRequests.deleteTraveler(session.token, travelerId);
            setMessage("常用出行人已删除。");
            await loadTravelers();
        } catch {
            setErrorMessage("删除失败，请稍后再试。");
        }
    };

    if (!session || !profile) {
        return (
            <main className="min-h-[calc(100vh-80px)] bg-[#f6f8fb] px-10 py-14">
                <section className="mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="flex flex-col justify-center">
                        <Chip className="mb-5 w-fit" color="primary" variant="outlined" label="我的账户"/>
                        <Typography variant="h3" className="font-semibold">
                            登录后可查看订单并管理常用信息
                        </Typography>
                        <Typography className="mt-4 max-w-2xl text-gray-600">
                            登录后可统一查看机票、火车票、酒店和度假订单，并保存常用出行人、入住人和支付信息。未登录时仍可先浏览价格和详情。
                        </Typography>
                        <div className="mt-8 flex gap-3">
                            <Button variant="contained" size="large" onClick={() => setAuthOpen(true)}>
                                登录 / 注册
                            </Button>
                            <Button variant="outlined" size="large" component={Link} to="/reservations/flights">
                                继续浏览
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-4">
                        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                            <TravelExplore className="mb-3 text-[#0f766e]"/>
                            <Typography variant="h6">出行偏好</Typography>
                            <Typography variant="body2" color="text.secondary">常用出发城市、席别偏好和筛选设置可随账户保存。</Typography>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                            <Bookmarks className="mb-3 text-[#556cd6]"/>
                            <Typography variant="h6">我的订单</Typography>
                            <Typography variant="body2" color="text.secondary">机票、火车票、酒店和度假订单都可以在这里统一查看。</Typography>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                            <Badge className="mb-3 text-[#d97706]"/>
                            <Typography variant="h6">账户资料</Typography>
                            <Typography variant="body2" color="text.secondary">实名信息、联系人和支付方式越完整，后续预订会更顺畅。</Typography>
                        </div>
                    </div>
                </section>

                <AuthDialog
                    open={authOpen}
                    onClose={() => setAuthOpen(false)}
                    onAuthenticated={handleAuthenticated}
                />
            </main>
        );
    }

    return (
        <main className="min-h-[calc(100vh-80px)] bg-[#f6f8fb] px-8 py-10">
            <section className="mx-auto grid max-w-7xl grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
                <Paper elevation={0} className="h-fit border border-gray-200 p-6">
                    <div className="flex items-center gap-4 pb-6">
                        <Avatar src={resolveCommunityImageUrl(profile.avatarUrl) || undefined} sx={{width: 72, height: 72, bgcolor: "#0f766e"}}>
                            {initials}
                        </Avatar>
                        <div>
                            <Typography variant="h5" className="font-semibold">
                                {profile.name || "我的账户"}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {profile.email}
                            </Typography>
                        </div>
                    </div>

                    <Divider className="mb-5"/>

                    <div className="grid gap-3">
                        <div className="flex items-center justify-between rounded-lg bg-white px-4 py-3">
                            <span className="text-sm text-gray-600">实名状态</span>
                            <Chip size="small" color={identityVerified ? "primary" : "default"} label={identityVerified ? "已实名" : "未实名"}/>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-3">
                        <Button component={Link} to="/reservations" variant="contained" startIcon={<Bookmarks/>}>
                            查看历史订单
                        </Button>
                        <Button color="error" variant="text" startIcon={<Logout/>} onClick={() => setLogoutDialogOpen(true)}>
                            退出登录
                        </Button>
                    </div>
                </Paper>

                <div className="grid gap-6">
                    <Paper elevation={0} className="border border-gray-200 px-2">
                        <Tabs
                            value={activeTab}
                            onChange={(_, value: "profile" | "travel") => setActiveTab(value)}
                            variant="fullWidth"
                            textColor="primary"
                            indicatorColor="primary"
                            aria-label="账户中心选项卡"
                        >
                            <Tab value="profile" label="账户资料"/>
                            <Tab value="travel" label="实名与出行信息"/>
                        </Tabs>
                    </Paper>

                    {activeTab === "profile" &&
                        <Paper elevation={0} className="border border-gray-200 p-6">
                        <div className="mb-5 flex items-center justify-between">
                            <div>
                                <Typography variant="h5" className="font-semibold">账户资料</Typography>
                                <Typography variant="body2" color="text.secondary">更新联系人信息，后续预订会默认使用当前账户。</Typography>
                            </div>
                            <AccountCircle style={{fontSize: 36, color: "#0f766e"}}/>
                        </div>

                        {loading && <LinearProgress className="mb-4"/>}
                        {message && <Alert severity="success" className="mb-4">{message}</Alert>}
                        {errorMessage && <Alert severity="error" className="mb-4">{errorMessage}</Alert>}

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <TextField
                                label="用户昵称"
                                value={profileForm.name}
                                onChange={event => setProfileForm({
                                    ...profileForm,
                                    name: event.target.value,
                                    surname: ""
                                })}
                                helperText="用于社区互动和账户展示"
                                fullWidth
                            />
                            <TextField
                                label="邮箱"
                                type="email"
                                value={profileForm.email}
                                onChange={event => setProfileForm({...profileForm, email: event.target.value})}
                                fullWidth
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><Email fontSize="small"/></InputAdornment>
                                }}
                            />
                            <TextField
                                label="手机号"
                                value={profileForm.phone}
                                onChange={event => setProfileForm({...profileForm, phone: event.target.value})}
                                fullWidth
                                error={Boolean(profileForm.phone && profilePhoneError)}
                                helperText={profileForm.phone ? profilePhoneError || "用于接收订单提醒和联系通知" : "用于接收订单提醒和联系通知"}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><Phone fontSize="small"/></InputAdornment>
                                }}
                            />
                            <div className="md:col-span-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                                    <Avatar
                                        src={resolveCommunityImageUrl(profileForm.avatarUrl) || undefined}
                                        sx={{width: 76, height: 76, bgcolor: "#0f766e", flexShrink: 0}}
                                    >
                                        {initials}
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <TextField
                                            label="头像"
                                            value={avatarInput}
                                            onChange={event => {
                                                const value = event.target.value;
                                                setAvatarInput(value);
                                                setProfileForm(current => ({...current, avatarUrl: value}));
                                            }}
                                            placeholder="粘贴图片 URL，或使用本地上传"
                                            helperText="支持从 URL 获取头像，也支持上传本地图片"
                                            fullWidth
                                        />
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <Button
                                                variant="outlined"
                                                component="label"
                                                startIcon={avatarUploading ? <CircularProgress size={16}/> : <CloudUpload/>}
                                                disabled={avatarUploading}
                                            >
                                                {avatarUploading ? "上传中..." : "本地上传"}
                                                <input
                                                    ref={avatarInputRef}
                                                    hidden
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={event => uploadAvatar(event.target.files?.[0])}
                                                />
                                            </Button>
                                            {profileForm.avatarUrl &&
                                                <Button
                                                    variant="text"
                                                    onClick={() => {
                                                        setAvatarInput("");
                                                        setProfileForm(current => ({...current, avatarUrl: ""}));
                                                    }}
                                                    disabled={avatarUploading}
                                                >
                                                    清除头像
                                                </Button>
                                            }
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <Button variant="contained" startIcon={<Save/>} disabled={saving} onClick={saveProfile}>
                                {saving ? "保存中..." : "保存资料"}
                            </Button>
                        </div>
                        </Paper>
                    }

                    {activeTab === "travel" &&
                        <>
                        <section aria-labelledby="identity-information-heading">
                        <Paper elevation={0} className="border border-teal-200 border-t-4 bg-white p-6">
                        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <Typography id="identity-information-heading" variant="h5" className="font-semibold">实名信息</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    实名资料会用于机票、火车票和酒店预订时的身份核验。
                                </Typography>
                            </div>
                            <div className="flex items-center gap-2">
                                <Chip color={identityVerified ? "success" : "warning"} label={identityVerified ? "已实名" : "待完善"}/>
                                <CreditCard style={{fontSize: 36, color: "#0f766e"}}/>
                            </div>
                        </div>

                        <div>
                            <div className="rounded-lg border border-gray-200 p-4">
                                <p className="mb-4 text-xs text-gray-500">支付前会要求填写付款人实名信息，证件号仅用于当前账户的出行与支付校验。</p>
                                {identityMessage && <Alert severity="success" className="mb-4">{identityMessage}</Alert>}
                                {identityErrorMessage && <Alert severity="error" className="mb-4">{identityErrorMessage}</Alert>}
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <TextField
                                        label="真实姓名"
                                        value={identityForm.realName}
                                        onChange={event => setIdentityForm({...identityForm, realName: event.target.value})}
                                        fullWidth
                                    />
                                    <TextField
                                        select
                                        label="证件类型"
                                        value={identityForm.documentType}
                                        onChange={event => setIdentityForm({...identityForm, documentType: event.target.value})}
                                        fullWidth
                                    >
                                        {documentTypeOptions.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
                                    </TextField>
                                    <TextField
                                        className="md:col-span-2"
                                        label="证件号码"
                                        value={identityForm.documentNumber}
                                        onChange={event => setIdentityForm({...identityForm, documentNumber: event.target.value.trim()})}
                                        error={Boolean(identityForm.documentNumber && identityDocumentError)}
                                        helperText={identityForm.documentNumber
                                            ? identityDocumentError || `已识别生日 ${identityResidentInfo?.birthDate} · ${identityResidentInfo?.age} 岁，展示时会脱敏：${maskValue(identityForm.documentNumber)}`
                                            : "用于模拟出票/入住身份核验"}
                                        fullWidth
                                    />
                                </div>
                                <div className="mt-4 flex justify-end">
                                    <Button variant="contained" startIcon={<Save/>} onClick={saveIdentity}>保存实名信息</Button>
                                </div>
                            </div>
                        </div>
                        </Paper>
                        </section>

                                        <Paper elevation={0} className="border border-gray-200 p-6">
                        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <Typography variant="h5" className="font-semibold">银联卡</Typography>
                                <Typography variant="body2" color="text.secondary">保存后支付订单时可直接选择，卡号仅显示末四位。</Typography>
                            </div>
                            <CreditCard style={{fontSize: 36, color: "#0f766e"}}/>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto]">
                            <TextField
                                label="银联卡号"
                                value={bankCardNumber}
                                onChange={event => setBankCardNumber(normalizeDigits(event.target.value).slice(0, 19))}
                                error={Boolean(bankCardNumber && validateBankCard(bankCardNumber))}
                                helperText={bankCardNumber ? validateBankCard(bankCardNumber) || (getBankCardIssuerInfo(bankCardNumber)?.displayName || "银联卡") : "支持 16-19 位银联卡号"}
                                fullWidth
                            />
                            <TextField
                                label="卡片名称（选填）"
                                value={bankCardLabel}
                                onChange={event => setBankCardLabel(event.target.value.slice(0, 30))}
                                placeholder="例如：日常支付"
                                fullWidth
                            />
                            <Button variant="contained" startIcon={<CreditCard/>} onClick={addBankCard} disabled={!bankCardNumber || Boolean(validateBankCard(bankCardNumber))}>添加</Button>
                        </div>
                        <div className="mt-4 grid gap-3">
                            {savedBankCards.length === 0 && <Typography variant="body2" color="text.secondary">暂未保存银联卡。</Typography>}
                            {savedBankCards.map(card => (
                                <div key={card.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3">
                                    <div>
                                        <p className="font-semibold text-gray-900">{card.label}</p>
                                        <p className="text-sm text-gray-500">银联卡 ? **** **** **** {card.cardNumber.slice(-4)}</p>
                                    </div>
                                    <Button size="small" color="error" startIcon={<Delete/>} onClick={() => deleteBankCard(card.id)}>删除</Button>
                                </div>
                            ))}
                        </div>
                    </Paper>

<Paper elevation={0} className="border border-gray-200 p-6">
                        <div className="mb-5 flex items-center justify-between">
                            <div>
                                <Typography variant="h5" className="font-semibold">预订偏好</Typography>
                                <Typography variant="body2" color="text.secondary">保存常用线路和筛选条件，机票、火车票、酒店查询会优先套用。</Typography>
                            </div>
                            <TravelExplore style={{fontSize: 36, color: "#2563eb"}}/>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <TextField
                                label="默认出发城市"
                                value={bookingPreferences.defaultDepartureCity}
                                onChange={event => updateBookingPreference("defaultDepartureCity", event.target.value)}
                                fullWidth
                            />
                            <TextField
                                label="默认到达城市"
                                value={bookingPreferences.defaultArrivalCity}
                                onChange={event => updateBookingPreference("defaultArrivalCity", event.target.value)}
                                fullWidth
                            />
                            <TextField
                                label="酒店最高预算"
                                type="number"
                                value={bookingPreferences.preferredHotelMaxPrice}
                                onChange={event => updateBookingPreference("preferredHotelMaxPrice", event.target.value)}
                                placeholder="不限"
                                inputProps={{min: 0}}
                                fullWidth
                            />
                            <div className="rounded-lg border border-gray-200 px-4 py-3">
                                <p className="mb-2 text-sm font-semibold text-gray-700">酒店最低评分</p>
                                <Rating
                                    value={bookingPreferences.preferredHotelMinRating}
                                    onChange={(_, value) => updateBookingPreference("preferredHotelMinRating", value ?? 0)}
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    {bookingPreferences.preferredHotelMinRating ? `${bookingPreferences.preferredHotelMinRating} 分以上` : "不限评分"}
                                </p>
                            </div>
                            <div className="rounded-lg border border-gray-200 px-4 py-3 md:col-span-2">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-700">火车车次偏好</p>
                                        <p className="text-xs text-gray-500">进入火车票页时默认勾选这些车次类型。</p>
                                    </div>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={bookingPreferences.onlyAvailableTickets}
                                                onChange={event => updateBookingPreference("onlyAvailableTickets", event.target.checked)}
                                            />
                                        }
                                        label="只看有票"
                                    />
                                </div>
                                <ToggleButtonGroup size="small" value={bookingPreferences.preferredTrainTypes}>
                                    {trainTypeOptions.map(option => (
                                        <ToggleButton
                                            key={option.value}
                                            value={option.value}
                                            selected={bookingPreferences.preferredTrainTypes.includes(option.value)}
                                            onClick={() => togglePreferredTrainType(option.value)}
                                        >
                                            {option.label}
                                        </ToggleButton>
                                    ))}
                                </ToggleButtonGroup>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <Button variant="contained" startIcon={<Save/>} onClick={savePreferences}>
                                保存偏好
                            </Button>
                        </div>
                    </Paper>

                    <Paper elevation={0} className="border border-gray-200 p-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <Typography variant="h5" className="font-semibold">常用出行人</Typography>
                                <Typography variant="body2" color="text.secondary">预订机票、火车票和酒店时可以直接勾选。</Typography>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outlined" startIcon={<AccountCircle/>} onClick={openCreateSelfTraveler}>添加本人</Button>
                                <Button variant="contained" startIcon={<PersonAdd/>} onClick={openCreateTraveler}>新增</Button>
                            </div>
                        </div>

                        {travelerEditorOpen &&
                            <div className="mt-5 rounded-lg border border-gray-200 bg-[#f8fafc] p-4">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <TextField label="姓名" value={travelerForm.name} onChange={event => setTravelerForm({...travelerForm, name: event.target.value})}/>
                                    <TextField select label="人员类型" value={travelerForm.travelerType} onChange={event => setTravelerForm({...travelerForm, travelerType: event.target.value as TravelerType})}>
                                        <MenuItem value="ADULT">成人</MenuItem>
                                        <MenuItem value="CHILD">儿童</MenuItem>
                                        <MenuItem value="STUDENT">学生</MenuItem>
                                    </TextField>
                                    <TextField select label="证件类型" value={travelerForm.documentType} onChange={event => setTravelerForm({...travelerForm, documentType: event.target.value})}>
                                        {documentTypeOptions.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
                                    </TextField>
                                    <TextField
                                        label="证件号码"
                                        value={travelerForm.documentNumber}
                                        onChange={event => setTravelerForm({...travelerForm, documentNumber: event.target.value})}
                                        error={Boolean(travelerForm.documentNumber && travelerDocumentError)}
                                        helperText={travelerForm.documentNumber
                                            ? travelerDocumentError || `${travelerResidentInfo ? `已识别生日 ${travelerResidentInfo.birthDate} · ${travelerResidentInfo.age} 岁，` : ""}预订车票/酒店时会用于身份校验`
                                            : "预订车票/酒店时会用于身份校验"}
                                    />
                                    <TextField
                                        label="手机号"
                                        value={travelerForm.phone}
                                        onChange={event => setTravelerForm({...travelerForm, phone: event.target.value})}
                                        error={Boolean(travelerForm.phone && travelerPhoneError)}
                                        helperText={travelerForm.phone ? travelerPhoneError || "选填，用于接收订单提醒" : "选填，用于接收订单提醒"}
                                    />
                                    <div className="flex flex-wrap items-center gap-3">
                                        <FormControlLabel control={<Checkbox checked={travelerForm.student} onChange={event => setTravelerForm({...travelerForm, student: event.target.checked})}/>} label="学生身份"/>
                                        <FormControlLabel control={<Checkbox checked={travelerForm.defaultTraveler} onChange={event => setTravelerForm({...travelerForm, defaultTraveler: event.target.checked})}/>} label="默认出行人"/>
                                    </div>
                                </div>
                                {errorMessage && <Alert severity="error" className="mt-4">{errorMessage}</Alert>}
                                <div className="mt-4 flex justify-end gap-2">
                                    <Button onClick={() => setTravelerEditorOpen(false)}>取消</Button>
                                    <Button
                                        variant="contained"
                                        startIcon={<Save/>}
                                        disabled={saving || !travelerForm.name.trim() || Boolean(travelerDocumentError) || Boolean(travelerPhoneError)}
                                        onClick={saveTraveler}
                                    >
                                        保存
                                    </Button>
                                </div>
                            </div>
                        }

                        <div className="mt-5 grid gap-3">
                            {travelers.map(traveler => (
                                <div key={traveler.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-semibold text-gray-900">{traveler.name}</p>
                                            <Chip size="small" label={traveler.travelerType === "CHILD" ? "儿童" : traveler.travelerType === "STUDENT" ? "学生" : "成人"}/>
                                            {traveler.defaultTraveler && <Chip size="small" color="primary" label="默认"/>}
                                        </div>
                                        <p className="mt-1 text-xs text-gray-500">
                                            {traveler.documentType || "证件未填写"} {traveler.documentNumber ? maskValue(traveler.documentNumber) : ""}
                                            {traveler.phone ? ` · ${maskValue(traveler.phone, 3, 4)}` : ""}
                                            {traveler.documentType === "身份证" && getChineseResidentIdInfo(traveler.documentNumber) ? ` · ${getChineseResidentIdInfo(traveler.documentNumber)?.birthDate} · ${getChineseResidentIdInfo(traveler.documentNumber)?.age} 岁` : ""}
                                        </p>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button size="small" startIcon={<Edit/>} onClick={() => openEditTraveler(traveler)}>编辑</Button>
                                        <Button size="small" color="error" startIcon={<Delete/>} onClick={() => deleteTraveler(traveler.id)}>删除</Button>
                                    </div>
                                </div>
                            ))}
                            {travelers.length === 0 &&
                                <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
                                    暂无常用出行人，添加后预订会更快。
                                </div>
                            }
                        </div>
                    </Paper>
                        </>
                    }
                </div>
            </section>

        <Dialog open={logoutDialogOpen} onClose={() => setLogoutDialogOpen(false)}>
            <DialogTitle>确认退出登录</DialogTitle>
            <DialogContent>
                <DialogContentText>确定要退出当前账户吗？</DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setLogoutDialogOpen(false)}>取消</Button>
                <Button color="error" variant="contained" onClick={logout}>退出登录</Button>
            </DialogActions>
        </Dialog>
        </main>
    );
}
