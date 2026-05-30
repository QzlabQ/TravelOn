import React, {useEffect, useMemo, useState} from "react";
import {
    Alert,
    Avatar,
    Button,
    Chip,
    Divider,
    InputAdornment,
    LinearProgress,
    Paper,
    TextField,
    Typography
} from "@mui/material";
import {
    AccountCircle,
    Badge,
    Bookmarks,
    Email,
    Logout,
    Phone,
    Save,
    TravelExplore
} from "@mui/icons-material";
import {Link, useNavigate} from "react-router-dom";
import AuthDialog from "../components/AuthDialog";
import {
    clearCurrentUserSession,
    getCurrentUserSession,
    updateCurrentUserProfile,
    UserProfile,
    UserSession
} from "../../core/currentUser";
import {ApiRequests} from "../../core/apiConfig";

const emptyProfileForm = {
    name: "",
    surname: "",
    email: "",
    phone: "",
    avatarUrl: ""
};

export default function Account() {
    const navigate = useNavigate();
    const [session, setSession] = useState<UserSession | null>(getCurrentUserSession());
    const [profileForm, setProfileForm] = useState(emptyProfileForm);
    const [authOpen, setAuthOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");

    const profile = session?.user;

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

    useEffect(() => {
        if (profile) {
            syncProfileForm(profile);
            refreshProfile().then(r => r);
        }
    }, []);

    const handleAuthenticated = (nextSession: UserSession) => {
        setSession(nextSession);
        syncProfileForm(nextSession.user);
        setMessage("登录成功，欢迎回来。");
        setErrorMessage("");
    };

    const saveProfile = async () => {
        if (!session) return;
        setSaving(true);
        setMessage("");
        setErrorMessage("");

        try {
            const response = await ApiRequests.updateCurrentUser(session.token, profileForm);
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
        navigate("/");
    };

    if (!session || !profile) {
        return (
            <main className="min-h-[calc(100vh-80px)] bg-[#f6f8fb] px-10 py-14">
                <section className="mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="flex flex-col justify-center">
                        <Chip className="mb-5 w-fit" color="primary" variant="outlined" label="Tour Central 账户"/>
                        <Typography variant="h3" className="font-semibold">
                            登录后，旅程会跟着你走。
                        </Typography>
                        <Typography className="mt-4 max-w-2xl text-gray-600">
                            把套餐预订、机票火车票、酒店订单和 AI 行程规划放在同一个账户里。现在仍可游客浏览，登录后会使用账户 ID 保存新订单。
                        </Typography>
                        <div className="mt-8 flex gap-3">
                            <Button variant="contained" size="large" onClick={() => setAuthOpen(true)}>
                                登录 / 注册
                            </Button>
                            <Button variant="outlined" size="large" component={Link} to="/offers">
                                继续看产品
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-4">
                        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                            <TravelExplore className="mb-3 text-[#0f766e]"/>
                            <Typography variant="h6">智能规划</Typography>
                            <Typography variant="body2" color="text.secondary">AI 行程和收藏点位可随账户继续维护。</Typography>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                            <Bookmarks className="mb-3 text-[#556cd6]"/>
                            <Typography variant="h6">订单中枢</Typography>
                            <Typography variant="body2" color="text.secondary">集中查看套餐、酒店、机票与火车票预订。</Typography>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                            <Badge className="mb-3 text-[#d97706]"/>
                            <Typography variant="h6">会员身份</Typography>
                            <Typography variant="body2" color="text.secondary">资料越完整，后续推荐和预订流程越省心。</Typography>
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
                    <div className="flex items-center gap-4">
                        <Avatar src={profile.avatarUrl || undefined} sx={{width: 72, height: 72, bgcolor: "#0f766e"}}>
                            {initials}
                        </Avatar>
                        <div>
                            <Typography variant="h5" className="font-semibold">
                                {profile.name} {profile.surname}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {profile.email}
                            </Typography>
                        </div>
                    </div>

                    <Divider className="my-5"/>

                    <div className="grid gap-3">
                        <div className="flex items-center justify-between rounded-lg bg-[#eef7f5] px-4 py-3">
                            <span className="text-sm text-gray-600">会员等级</span>
                            <Chip size="small" color="success" label={profile.loyaltyTier || "Explorer"}/>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-white px-4 py-3">
                            <span className="text-sm text-gray-600">账户 ID</span>
                            <span className="max-w-[180px] truncate text-xs text-gray-500">{profile.id}</span>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-3">
                        <Button component={Link} to="/reservations" variant="contained" startIcon={<Bookmarks/>}>
                            查看我的预订
                        </Button>
                        <Button component={Link} to="/ai-planner" variant="outlined" startIcon={<TravelExplore/>}>
                            打开 AI 规划
                        </Button>
                        <Button color="error" variant="text" startIcon={<Logout/>} onClick={logout}>
                            退出登录
                        </Button>
                    </div>
                </Paper>

                <div className="grid gap-6">
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
                                label="名"
                                value={profileForm.name}
                                onChange={event => setProfileForm({...profileForm, name: event.target.value})}
                                fullWidth
                            />
                            <TextField
                                label="姓"
                                value={profileForm.surname}
                                onChange={event => setProfileForm({...profileForm, surname: event.target.value})}
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
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><Phone fontSize="small"/></InputAdornment>
                                }}
                            />
                            <TextField
                                className="md:col-span-2"
                                label="头像 URL"
                                value={profileForm.avatarUrl}
                                onChange={event => setProfileForm({...profileForm, avatarUrl: event.target.value})}
                                fullWidth
                            />
                        </div>

                        <div className="mt-6 flex justify-end">
                            <Button variant="contained" startIcon={<Save/>} disabled={saving} onClick={saveProfile}>
                                {saving ? "保存中..." : "保存资料"}
                            </Button>
                        </div>
                    </Paper>
                </div>
            </section>
        </main>
    );
}
