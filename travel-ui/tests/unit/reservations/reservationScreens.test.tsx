import React from 'react';
import {render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Reservations from '../../../src/reservations/screens/Reservations';
import TravelTimeline from '../../../src/reservations/screens/TravelTimeline';
import {ApiRequests} from '../../../src/core/apiConfig';
import '../setupTests';

jest.mock('../../../src/core/apiConfig', () => ({
    ApiRequests: {
        getReservationsForUser: jest.fn(),
    },
}));
jest.mock('../../../src/core/currentUser', () => ({
    getCurrentUserId: () => 'guest-user',
    getCurrentUserMode: () => 'GUEST',
}));
jest.mock('../../../src/core/useAuthSession', () => ({
    useAuthSession: () => null,
}));

const renderWithRouter = (component: React.ReactElement) => render(
    <MemoryRouter>{component}</MemoryRouter>,
);

describe('guest reservation views', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('shows an empty reservation state without a backend error for guests', async () => {
        renderWithRouter(<Reservations/>);

        await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());

        expect(ApiRequests.getReservationsForUser).not.toHaveBeenCalled();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('shows an empty timeline state without a backend error for guests', async () => {
        renderWithRouter(<TravelTimeline/>);

        await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());

        expect(ApiRequests.getReservationsForUser).not.toHaveBeenCalled();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
