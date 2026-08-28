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
import {Cancel, EventNote, Refresh, Visibility} from "@mui/icons-material";
import {ApiRequests, ReservationResponse} from "../../core/apiConfig";
import {getCurrentUserId, getCurrentUserMode} from "../../core/currentUser";
import {useAuthSession} from "../../core/useAuthSession";
import {Link} from "react-router-dom";
import {
    canCancelReservation,
    formatTripDate,
    getEffectiveReservationStatus,
    getReservationStatusMeta
} from "../orderStatus";

const Reservations = () => {
    const session = useAuthSession();
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
            if (!session) throw new Error("Authentication required");
            const response = await ApiRequests.getReservationsForUser(session.token, userId);
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
            if (!session) throw new Error("Authentication required");
            await ApiRequests.cancelReservation(session.token, reservationId, '从订单列表取消');
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
    }, [session?.token, userId]);

    return (
        <div className='flex flex-col px-48 py-16'>
            <div className='flex flex-row items-center justify-between mb-6'>
                <div>
                    <h1 className='text-2xl font-semibold mb-2'>我的预定</h1>
                    <p className='text-sm text-gray-500'>
                        {userMode === 'GUEST' ? '当前使用游客身份保存预定，之后登录账号可以迁移绑定。' : '当前显示账号下的预定。'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button component={Link} to="/reservations/timeline" variant="contained" startIcon={<EventNote/>}>
                        我的行程
                    </Button>
                    <Button variant='outlined' startIcon={<Refresh/>} onClick={loadReservations} disabled={loading}>
                        刷新
                    </Button>
                </div>
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
                                                {reservation.hotelId ? `酒店 ${reservation.hotelId}` : reservation.provider || '订单详情'}
                                            </p>
                                        </TableCell>
                                        <TableCell>{formatTripDate(reservation.hotelTimeFrom)}</TableCell>
                                        <TableCell>{formatTripDate(reservation.hotelTimeTo)}</TableCell>
                                        <TableCell>
                                            {reservation.adultsQuantity + reservation.childrenUnder18Quantity + reservation.childrenUnder10Quantity + reservation.childrenUnder3Quantity}
                                        </TableCell>
                                        <TableCell>{Math.ceil(reservation.price).toLocaleString()} 元</TableCell>
                                        <TableCell>
                                            <Chip
                                                size='small'
                                                color={getReservationStatusMeta(reservation).color}
                                                label={getReservationStatusMeta(reservation).label}
                                            />
                                        </TableCell>
                                        <TableCell align='right'>
                                            <div className='flex justify-end gap-2'>
                                                <Button component={Link} to={`/reservations/${reservation.id}`} variant='outlined' size='small' startIcon={<Visibility/>}>
                                                    详情
                                                </Button>
                                                {canCancelReservation(reservation) &&
                                                    <Button
                                                        color='error'
                                                        variant='outlined'
                                                        size='small'
                                                        startIcon={<Cancel/>}
                                                        disabled={getEffectiveReservationStatus(reservation) === 'CANCELLED' || getEffectiveReservationStatus(reservation) === 'EXPIRED' || cancellingId === reservation.id}
                                                        onClick={() => cancelReservation(reservation.id)}
                                                    >
                                                        取消
                                                    </Button>
                                                }
                                            </div>
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
