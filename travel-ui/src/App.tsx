import './App.css';
import {BrowserRouter as Router, Route, Routes} from 'react-router-dom';
import Offers from "./offers/screens/Offers";
import NotFound from "./core/screens/NotFound";
import Navbar from './core/components/Navbar';
import Home from "./core/screens/Home";
import OfferDetails from "./offers/screens/OfferDetails";
import {LocalizationProvider} from "@mui/x-date-pickers";
import {AdapterDayjs} from "@mui/x-date-pickers/AdapterDayjs";
import {useEffect} from "react";
import BuyOffer from "./offers/screens/BuyOffer";
import AiPlanner from "./ai-arrange/screens/AiPlanner";
import Reservations from "./reservations/screens/Reservations";
import TicketBooking from "./reservations/screens/TicketBooking";
import HotelBooking from "./reservations/screens/HotelBooking";
import HotelDetails from "./reservations/screens/HotelDetails";
import Account from "./account/screens/Account";
import ReservationDetails from "./reservations/screens/ReservationDetails";
import Community from "./community/screens/Community";
import CommunityPostDetails from "./community/screens/CommunityPostDetails";

function App() {
    useEffect(() => {
        document.title = 'Tour Central'
    }, []);

    return (
        <LocalizationProvider dateAdapter={AdapterDayjs}>
            <Router>
                <Navbar/>
                <Routes>
                    <Route path='/' element={<Home/>}/>
                    <Route path='/offers' element={<Offers/>}/>
                    <Route path='/offerDetails' element={<OfferDetails/>}/>
                    <Route path='/buyOffer' element={<BuyOffer/>}/>
                    <Route path='/reservations' element={<Reservations/>}/>
                    <Route path='/reservations/:reservationId' element={<ReservationDetails/>}/>
                    <Route path='/reservations/flights' element={<TicketBooking mode='flight'/>}/>
                    <Route path='/reservations/trains' element={<TicketBooking mode='train'/>}/>
                    <Route path='/reservations/hotels' element={<HotelBooking/>}/>
                    <Route path='/reservations/hotels/:hotelId' element={<HotelDetails/>}/>
                    <Route path='/account' element={<Account/>}/>
                    <Route path='/community' element={<Community/>}/>
                    <Route path='/community/posts/:postId' element={<CommunityPostDetails/>}/>
                    <Route path='/ai-planner' element={<AiPlanner/>}/>
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </Router>
        </LocalizationProvider>
    );
}

export default App;
