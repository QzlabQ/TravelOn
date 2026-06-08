import {Button, Paper} from "@mui/material";
import {ArrowBack, Construction} from "@mui/icons-material";
import {useNavigate} from "react-router-dom";

const OfferDetails = () => {
    const navigate = useNavigate();

    return (
        <div className="flex min-h-[calc(100vh-80px)] items-start justify-center px-8 py-16">
            <Paper className="w-full max-w-3xl px-8 py-8" elevation={1} style={{borderRadius: 8}}>
                <Button variant="text" startIcon={<ArrowBack/>} onClick={() => navigate(-1)}>
                    返回
                </Button>

                <div className="mt-6 flex items-center gap-3">
                    <Construction color="primary"/>
                    <h1 className="text-2xl font-semibold text-slate-900">旅游产品详情</h1>
                </div>

                <p className="mt-5 text-slate-600">
                    旧的旅游套餐详情、交通组合、房型餐饮配置和实时价格功能已停用。
                </p>
            </Paper>
        </div>
    );
}

export default OfferDetails;
