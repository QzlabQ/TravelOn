import { render } from '@testing-library/react';
import './setupTests';
import App from '../../src/App';

jest.mock('../../src/core/screens/Home', () => () => <div>Home screen</div>);
jest.mock('../../src/core/screens/NotFound', () => () => <div>Not found</div>);
jest.mock('../../src/core/components/Navbar', () => () => <nav>Travel navigation</nav>);
jest.mock('../../src/ai-arrange/screens/AiPlanner', () => () => <div>AI planner</div>);
jest.mock('../../src/reservations/screens/Reservations', () => () => <div>Reservations</div>);
jest.mock('../../src/reservations/screens/TicketBooking', () => () => <div>Ticket booking</div>);
jest.mock('../../src/reservations/screens/HotelBooking', () => () => <div>Hotel booking</div>);
jest.mock('../../src/reservations/screens/HotelDetails', () => () => <div>Hotel details</div>);
jest.mock('../../src/account/screens/Account', () => () => <div>Account</div>);
jest.mock('../../src/reservations/screens/ReservationDetails', () => () => <div>Reservation details</div>);
jest.mock('../../src/reservations/screens/TravelTimeline', () => () => <div>Travel timeline</div>);
jest.mock('../../src/community/screens/Community', () => () => <div>Community</div>);
jest.mock('../../src/community/screens/CommunityPostDetails', () => () => <div>Community post</div>);
jest.mock('../../src/community/screens/AttractionDetails', () => () => <div>Attraction</div>);
jest.mock('../../src/community/screens/RouteDetails', () => () => <div>Route</div>);
jest.mock('../../src/community/screens/CommunityProfile', () => () => <div>Profile</div>);

test('renders the travel application and sets its document title', () => {
  render(<App />);
  expect(document.title).toBe('Tour Central');
});
