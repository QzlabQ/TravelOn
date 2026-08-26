import { render } from '@testing-library/react';
import App from './App';

jest.mock('./core/screens/Home', () => () => <div>Home screen</div>);
jest.mock('./core/screens/NotFound', () => () => <div>Not found</div>);
jest.mock('./core/components/Navbar', () => () => <nav>Travel navigation</nav>);
jest.mock('./ai-arrange/screens/AiPlanner', () => () => <div>AI planner</div>);
jest.mock('./reservations/screens/Reservations', () => () => <div>Reservations</div>);
jest.mock('./reservations/screens/TicketBooking', () => () => <div>Ticket booking</div>);
jest.mock('./reservations/screens/HotelBooking', () => () => <div>Hotel booking</div>);
jest.mock('./reservations/screens/HotelDetails', () => () => <div>Hotel details</div>);
jest.mock('./account/screens/Account', () => () => <div>Account</div>);
jest.mock('./reservations/screens/ReservationDetails', () => () => <div>Reservation details</div>);
jest.mock('./reservations/screens/TravelTimeline', () => () => <div>Travel timeline</div>);
jest.mock('./community/screens/Community', () => () => <div>Community</div>);
jest.mock('./community/screens/CommunityPostDetails', () => () => <div>Community post</div>);
jest.mock('./community/screens/AttractionDetails', () => () => <div>Attraction</div>);
jest.mock('./community/screens/RouteDetails', () => () => <div>Route</div>);
jest.mock('./community/screens/CommunityProfile', () => () => <div>Profile</div>);

test('renders the travel application and sets its document title', () => {
  render(<App />);
  expect(document.title).toBe('Tour Central');
});
