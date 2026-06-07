import React, {useEffect, useState} from "react";
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    Divider,
    InputAdornment,
    Tab,
    Tabs,
    TextField,
    Typography
} from "@mui/material";
import {Email, Lock, Person, Phone, TravelExplore} from "@mui/icons-material";
import {ApiRequests} from "../../core/apiConfig";
import {setCurrentUserSession, UserSession} from "../../core/currentUser";
import {normalizeChinaMainlandPhone, validateChinaMainlandPhone} from "../../core/validation";

type AuthMode = "login" | "register";

type AuthDialogProps = {
    open: boolean;
    initialMode?: AuthMode;
    onClose: () => void;
    onAuthenticated?: (session: UserSession) => void;
};

const defaultLoginForm = {
    email: "",
    password: ""
};

const defaultRegisterForm = {
    email: "",
    password: "",
    confirmPassword: "",
    realName: "",
    phone: ""
};

export default function AuthDialog({open, initialMode = "login", onClose, onAuthenticated}: AuthDialogProps) {
    const [mode, setMode] = useState<AuthMode>(initialMode);
    const [loginForm, setLoginForm] = useState(defaultLoginForm);
    const [registerForm, setRegisterForm] = useState(defaultRegisterForm);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const registerPhoneError = validateChinaMainlandPhone(registerForm.phone, false);
    const registerRealNameError = registerForm.realName.trim() ? "" : "请输入真实姓名。";
    const registerConfirmPasswordError = !registerForm.confirmPassword
        ? "请再次输入密码。"
        : (registerForm.password === registerForm.confirmPassword ? "" : "两次输入的密码不一致。");

    useEffect(() => {
        if (open) {
            setMode(initialMode);
            setErrorMessage("");
        }
    }, [initialMode, open]);

    const completeAuth = (session: UserSession) => {
        setCurrentUserSession(session);
        onAuthenticated?.(session);
        onClose();
    };

    const submitLogin = async () => {
        setSubmitting(true);
        setErrorMessage("");

        try {
            const response = await ApiRequests.login(loginForm);
            completeAuth(response.data);
        } catch (e) {
            setErrorMessage("邮箱或密码不正确，请再试一次。");
        } finally {
            setSubmitting(false);
        }
    };

    const submitRegister = async () => {
        if (registerPhoneError) {
            setErrorMessage(registerPhoneError);
            return;
        }
        if (registerRealNameError) {
            setErrorMessage(registerRealNameError);
            return;
        }
        if (registerForm.password.length < 6) {
            setErrorMessage("密码不少于 6 位。");
            return;
        }
        if (registerConfirmPasswordError) {
            setErrorMessage(registerConfirmPasswordError);
            return;
        }

        setSubmitting(true);
        setErrorMessage("");

        try {
            const response = await ApiRequests.register({
                email: registerForm.email,
                password: registerForm.password,
                name: registerForm.realName.trim(),
                surname: "",
                phone: normalizeChinaMainlandPhone(registerForm.phone) || undefined
            });
            completeAuth(response.data);
        } catch (e: any) {
            if (e?.response?.status === 409) {
                setErrorMessage("这个邮箱已经注册过，请直接登录。");
            } else {
                setErrorMessage("注册失败，请确认信息完整且密码不少于 6 位。");
            }
        } finally {
            setSubmitting(false);
        }
    };

    const canLogin = loginForm.email.trim() && loginForm.password.trim();
    const canRegister =
        registerForm.email.trim() &&
        registerForm.password.length >= 6 &&
        registerForm.realName.trim() &&
        registerForm.confirmPassword &&
        !registerConfirmPasswordError &&
        !registerPhoneError;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <div className="grid grid-cols-1 md:grid-cols-[0.95fr_1.05fr]">
                <div className="hidden min-h-[520px] flex-col justify-between bg-[#0f766e] p-8 text-white md:flex">
                    <div>
                        <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-lg bg-white/15">
                            <TravelExplore/>
                        </div>
                        <Typography variant="h4" className="font-semibold">
                            让下一段旅程从账户开始
                        </Typography>
                        <Typography className="mt-4 text-white/80">
                            登录后会把预订、偏好、AI 行程和常用旅客信息放在同一个地方，下一次规划会更快。
                        </Typography>
                    </div>
                    <div className="grid gap-3 text-sm text-white/85">
                        <div className="rounded-lg border border-white/15 bg-white/10 p-4">统一管理机票、火车票、酒店和套餐订单</div>
                        <div className="rounded-lg border border-white/15 bg-white/10 p-4">保留你的出发城市、同行人数和旅行偏好</div>
                        <div className="rounded-lg border border-white/15 bg-white/10 p-4">账户资料会同步到后端 user-service</div>
                    </div>
                </div>

                <div className="px-6 py-6 md:px-8">
                    <DialogTitle className="px-0 pb-2">
                        <Typography variant="h5" className="font-semibold">
                            {mode === "login" ? "欢迎回来" : "注册账号"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" className="mt-1">
                            {mode === "login" ? "继续查看你的预订与旅程。" : "填写常用信息，像国内旅行应用一样快速注册。"}
                        </Typography>
                    </DialogTitle>

                    <DialogContent className="px-0">
                        <Tabs value={mode} onChange={(_, value) => {
                            setMode(value);
                            setErrorMessage("");
                        }} className="mb-5">
                            <Tab label="登录" value="login"/>
                            <Tab label="注册" value="register"/>
                        </Tabs>

                        {errorMessage && <Alert severity="error" className="mb-4">{errorMessage}</Alert>}

                        {mode === "login" &&
                            <Box className="flex flex-col gap-4">
                                <TextField
                                    label="邮箱"
                                    type="email"
                                    value={loginForm.email}
                                    onChange={event => setLoginForm({...loginForm, email: event.target.value})}
                                    fullWidth
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start"><Email fontSize="small"/></InputAdornment>
                                    }}
                                />
                                <TextField
                                    label="密码"
                                    type="password"
                                    value={loginForm.password}
                                    onChange={event => setLoginForm({...loginForm, password: event.target.value})}
                                    fullWidth
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start"><Lock fontSize="small"/></InputAdornment>
                                    }}
                                />
                                <Button
                                    variant="contained"
                                    size="large"
                                    disabled={!canLogin || submitting}
                                    onClick={submitLogin}
                                >
                                    {submitting ? "登录中..." : "登录"}
                                </Button>
                            </Box>
                        }

                        {mode === "register" &&
                            <Box className="flex flex-col gap-4">
                                <TextField
                                    label="真实姓名"
                                    value={registerForm.realName}
                                    onChange={event => setRegisterForm({...registerForm, realName: event.target.value})}
                                    error={Boolean(registerForm.realName && registerRealNameError)}
                                    helperText={registerForm.realName ? registerRealNameError || "请填写与证件一致的姓名。" : "请填写与证件一致的姓名。"}
                                    fullWidth
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start"><Person fontSize="small"/></InputAdornment>
                                    }}
                                />
                                <TextField
                                    label="邮箱"
                                    type="email"
                                    value={registerForm.email}
                                    onChange={event => setRegisterForm({...registerForm, email: event.target.value})}
                                    fullWidth
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start"><Email fontSize="small"/></InputAdornment>
                                    }}
                                />
                                <TextField
                                    label="手机号"
                                    value={registerForm.phone}
                                    onChange={event => setRegisterForm({...registerForm, phone: event.target.value})}
                                    error={Boolean(registerForm.phone && registerPhoneError)}
                                    helperText={registerForm.phone ? registerPhoneError || "支持中国大陆 11 位手机号，也可留空。" : "支持中国大陆 11 位手机号，也可留空。"}
                                    fullWidth
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start"><Phone fontSize="small"/></InputAdornment>
                                    }}
                                />
                                <TextField
                                    label="密码"
                                    type="password"
                                    helperText="至少 6 位"
                                    value={registerForm.password}
                                    onChange={event => setRegisterForm({...registerForm, password: event.target.value})}
                                    fullWidth
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start"><Lock fontSize="small"/></InputAdornment>
                                    }}
                                />
                                <TextField
                                    label="再次输入密码"
                                    type="password"
                                    value={registerForm.confirmPassword}
                                    onChange={event => setRegisterForm({...registerForm, confirmPassword: event.target.value})}
                                    error={Boolean(registerForm.confirmPassword && registerConfirmPasswordError)}
                                    helperText={registerForm.confirmPassword ? registerConfirmPasswordError || "请再次输入密码确认。" : "请再次输入密码确认。"}
                                    fullWidth
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start"><Lock fontSize="small"/></InputAdornment>
                                    }}
                                />
                                <Button
                                    variant="contained"
                                    size="large"
                                    disabled={!canRegister || submitting}
                                    onClick={submitRegister}
                                >
                                    {submitting ? "注册中..." : "注册账号"}
                                </Button>
                            </Box>
                        }
                    </DialogContent>
                </div>
            </div>
        </Dialog>
    );
}
