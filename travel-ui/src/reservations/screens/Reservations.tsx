import React, {useEffect, useState} from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    LinearProgress,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow
} from "@mui/material";
import {Cancel, Refresh} from "@mui/icons-material";
import {ApiRequests, ReservationResponse} from "../../core/apiConfig";
import {getCurrentUserId, getCurrentUserMode} from "../../core/currentUser";

const statusLabel = (reservation: ReservationResponse) => {
    if (reservation.status === 'PAID' || reservation.paid) return '已支付';
    if (reservation.status === 'CANCELLED') return '已取消';
    if (reservation.status === 'EXPIRED') return '已过期';
    return '待支付';
};

const statusColor = (reservation: ReservationResponse): "default" | "success" | "warning" | "error" => {
    if (reservation.status === 'PAID' || reservation.paid) return 'success';
    if (reservation.status === 'CANCELLED' || reservation.status === 'EXPIRED') return 'default';
    return 'warning';
};

const formatReservationDate = (value: string) => {
    if (!value) return '-';
    return new Date(value).toLocaleString();
};

const Reservations = () => {
    const [reservations, setReservations] = useState<ReservationResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [cancellingId, setCancellingId] = useState('');

    const userId = getCurrentUserId();
    const userMode = getCurrentUserMode();

    const loadReservations = async () => {
        setLoading(true);
        setError(false);

        try {
            const response = await ApiRequests.getReservationsForUser(userId);
            setReservations(response.data);
        } catch (e) {
            console.log(e);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    const cancelReservation = async (reservationId: string) => {
        setCancellingId(reservationId);
        try {
            await ApiRequests.cancelReservation(reservationId);
            await loadReservations();
        } catch (e) {
            console.log(e);
            setError(true);
        } finally {
            setCancellingId('');
        }
    };

    useEffect(() => {
        loadReservations().then(r => r);
    }, []);

    return (
        <div className='flex flex-col px-48 py-16'>
            <div className='flex flex-row items-center justify-between mb-6'>
                <div>
                    <h1 className='text-2xl font-semibold mb-2'>我的预定</h1>
                    <p className='text-sm text-gray-500'>
                        {userMode === 'GUEST' ? '当前使用游客身份保存预定，之后登录账号可以迁移绑定。' : '当前显示账号下的预定。'}
                    </p>
                </div>
                <Button variant='outlined' startIcon={<Refresh/>} onClick={loadReservations} disabled={loading}>
                    刷新
                </Button>
            </div>

            {loading && <Box sx={{height: 5}} className='mb-4'><LinearProgress/></Box>}

            {error && <Alert severity='error' className='mb-4'>读取预定失败，请确认后端服务已启动。</Alert>}

            {!loading && reservations.length === 0 && !error &&
                <Paper elevation={2} className='px-8 py-10'>
                    <p className='text-lg mb-2'>还没有预定</p>
                    <p className='text-gray-500'>完成一次产品预定后，这里会显示你的订单。</p>
                </Paper>
            }

            {reservations.length > 0 &&
                <Paper elevation={2}>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>订单号</TableCell>
                                    <TableCell>入住/出发</TableCell>
                                    <TableCell>结束/返程</TableCell>
                                    <TableCell>人数</TableCell>
                                    <TableCell>金额</TableCell>
                                    <TableCell>状态</TableCell>
                                    <TableCell align='right'>操作</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {reservations.map(reservation => (
                                    <TableRow key={reservation.id}>
                                        <TableCell>
                                            <p className='text-xs'>{reservation.id}</p>
                                            <p className='mt-1 text-xs font-semibold text-gray-700'>
                                                {reservation.title || reservation.bookingType || '旅行预订'}
                                            </p>
                                            <p className='text-xs text-gray-500 mt-1'>
                                                {reservation.routeFrom && reservation.routeTo
                                                    ? `${reservation.routeFrom} → ${reservation.routeTo}`
                                                    : reservation.hotelId ? `酒店 ${reservation.hotelId}` : reservation.provider || '订单详情'}
                                            </p>
                                        </TableCell>
                                        <TableCell>{formatReservationDate(reservation.hotelTimeFrom)}</TableCell>
                                        <TableCell>{formatReservationDate(reservation.hotelTimeTo)}</TableCell>
                                        <TableCell>
                                            {reservation.adultsQuantity + reservation.childrenUnder18Quantity + reservation.childrenUnder10Quantity + reservation.childrenUnder3Quantity}
                                        </TableCell>
                                        <TableCell>{Math.ceil(reservation.price).toLocaleString()} 元</TableCell>
                                        <TableCell>
                                            <Chip size='small' color={statusColor(reservation)} label={statusLabel(reservation)}/>
                                        </TableCell>
                                        <TableCell align='right'>
                                            <Button
                                                color='error'
                                                variant='outlined'
                                                size='small'
                                                startIcon={<Cancel/>}
                                                disabled={reservation.paid || reservation.status === 'CANCELLED' || cancellingId === reservation.id}
                                                onClick={() => cancelReservation(reservation.id)}
                                            >
                                                取消
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            }
        </div>
    );
};

export default Reservations;
