import {Button, Chip} from "@mui/material";
import {Bookmarks, Flight, Hotel, Train} from "@mui/icons-material";
import {Link} from "react-router-dom";

export default function Home() {
    const quickLinks = [
        {
            title: "机票预订",
            description: "支持乘机人、支付、订单状态与详情联动。",
            to: "/reservations/flights",
            icon: <Flight style={{color: "#2563eb"}}/>
        },
        {
            title: "火车票预订",
            description: "支持车次和席别筛选，链路更贴近真实购票流程。",
            to: "/reservations/trains",
            icon: <Train style={{color: "#2563eb"}}/>
        },
        {
            title: "酒店预订",
            description: "支持评分筛选、入住人选择和下单确认。",
            to: "/reservations/hotels",
            icon: <Hotel style={{color: "#2563eb"}}/>
        },
        {
            title: "我的订单",
            description: "统一查看待支付、已支付、已退款和已超时状态。",
            to: "/reservations",
            icon: <Bookmarks style={{color: "#2563eb"}}/>
        },
    ];

    return (
        <div className='min-h-[calc(100vh-80px)] bg-gradient-to-b from-slate-50 to-white px-8 py-16'>
            <div className='mx-auto max-w-6xl'>
                <div className='rounded-[32px] border border-slate-200 bg-white px-10 py-12 shadow-sm'>
                    <Chip className='w-fit' color='primary' variant='outlined' label='Tour Central'/>
                    <h1 className='mt-6 text-5xl font-bold tracking-wide text-slate-950'>
                        聚焦预订、账户和登录主链路
                    </h1>
                    <p className='mt-4 max-w-3xl text-lg leading-8 text-slate-600'>
                        首页现在只保留你们当前还在维护的核心能力，方便队友后续合并时更聚焦，也更容易验证。
                    </p>
                    <div className='mt-8 flex flex-wrap gap-3'>
                        <Button component={Link} to='/reservations/flights' variant='contained' startIcon={<Flight/>}>
                            机票预订
                        </Button>
                        <Button component={Link} to='/reservations/trains' variant='outlined' startIcon={<Train/>}>
                            火车票预订
                        </Button>
                        <Button component={Link} to='/reservations/hotels' variant='outlined' startIcon={<Hotel/>}>
                            酒店预订
                        </Button>
                        <Button component={Link} to='/reservations' variant='text' startIcon={<Bookmarks/>}>
                            查看订单
                        </Button>
                    </div>
                </div>

                <div className='mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4'>
                    {quickLinks.map((item) => (
                        <Link
                            key={item.to}
                            to={item.to}
                            className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md'
                        >
                            <div className='mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50'>
                                {item.icon}
                            </div>
                            <h2 className='text-lg font-semibold text-slate-900'>{item.title}</h2>
                            <p className='mt-2 text-sm leading-6 text-slate-500'>{item.description}</p>
                        </Link>
                    ))}
                </div>

                <div className='mt-12 flex items-center justify-center gap-4 overflow-hidden'>
                    <img src={require('../../assets/holiday-assets/aleks-marinkovic-jDFO3AvTLFw-unsplash.jpg')} alt=''
                         style={{width: 300, height: 200, objectFit: 'cover'}} className='drop-shadow-lg pointer-events-none'/>
                    <img src={require('../../assets/holiday-assets/dahee-son-tMffGE7u1bI-unsplash.jpg')} alt=''
                         style={{width: 300, height: 200, objectFit: 'cover'}} className='drop-shadow-lg pointer-events-none'/>
                    <img src={require('../../assets/holiday-assets/denys-nevozhai-guNIjIuUcgY-unsplash.jpg')} alt=''
                         style={{width: 300, height: 200, objectFit: 'cover'}} className='drop-shadow-lg pointer-events-none'/>
                    <img src={require('../../assets/holiday-assets/kira-laktionov-WK0_WJZ_umM-unsplash.jpg')} alt=''
                         style={{width: 300, height: 200, objectFit: 'cover'}} className='drop-shadow-lg pointer-events-none'/>
                    <img src={require('../../assets/holiday-assets/vicko-mozara-m82uh_vamhg-unsplash.jpg')} alt=''
                         style={{width: 300, height: 200, objectFit: 'cover'}} className='drop-shadow-lg pointer-events-none'/>
                </div>
            </div>
        </div>
    );
}
