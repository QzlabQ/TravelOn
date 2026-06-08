import {Button, Paper} from "@mui/material";
import {Construction, Refresh} from "@mui/icons-material";

const Offers = () => {
    return (
        <div className="flex min-h-[calc(100vh-80px)] items-start justify-center px-8 py-16">
            <Paper className="w-full max-w-3xl px-8 py-8" elevation={1} style={{borderRadius: 8}}>
                <div className="flex items-center gap-3">
                    <Construction color="primary"/>
                    <h1 className="text-2xl font-semibold text-slate-900">旅游产品</h1>
                </div>

                <p className="mt-5 text-slate-600">
                    旅游产品功能正在重构，旧的套餐搜索和组合报价已停用。
                </p>

                <div className="mt-8">
                    <Button variant="outlined" startIcon={<Refresh/>} disabled>
                        即将更新
                    </Button>
                </div>
            </Paper>
        </div>
    );
}

export default Offers;
