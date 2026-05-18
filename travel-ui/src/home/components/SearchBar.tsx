import {Button, ClickAwayListener, IconButton, Popper} from "@mui/material";
import {ArrowDropDown, Close} from "@mui/icons-material";
import SearchDestinationsPopper from "./SearchDestinationsPopper";
import SearchGuestQuantityPopper from "./SearchGuestQuantityPopper";
import SearchDateRangePopper from "./SearchDateRangePopper";
import SearchDeparturesPopper from "./SearchDeparturesPopper";
import SearchIcon from "@mui/icons-material/Search";
import React, {memo, useEffect, useState} from "react";
import {Location} from "../../core/domain/DomainInterfaces";
import {ApiRequests} from "../../core/apiConfig";

// @ts-ignore
const SearchBar = ({onSearch, hideClearSearch = false}) => {
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const [anchorType, setAnchorType] = useState('');

    const [arrivals, setArrivals] = useState([]);
    const [departures, setDepartures] = useState<{plane: Location[], bus: Location[]}>({
        plane: [],
        bus: []
    });

    const [selectedDestinations, setSelectedDestinations] = useState<Location[]>([]);
    const [selectedPlaneDepartures, setSelectedPlaneDepartures] = useState<Location[]>([]);
    const [selectedBusDepartures, setSelectedBusDepartures] = useState<Location[]>([]);

    const [selectedGuests, setSelectedGuests] = useState({
        adults: 2,
        teens: 0,
        kids: 0,
        infants: 0,
    });

    const [selectedDateFrom, setSelectedDateFrom] = useState(new Date(2024, 4, 1,));
    const [selectedDateTo, setSelectedDateTo] = useState(() => new Date(2024, 4, 3));

    const handleClick = (event: React.MouseEvent<HTMLElement>, type: string) => {
        setAnchorEl(event.currentTarget);
        setAnchorType(type);
    };

    const getAvailableDestinations = async () => {
        await ApiRequests.getAvailableDestinations()
            .then(response => {
                setDepartures({
                    plane: response.data.departures.plane,
                    bus: response.data.departures.bus
                })
                setArrivals(response.data.arrivals);
            })
            .catch(e => {
                console.log(e);
            })
    }

    const onDestinationSelection = (destination: any) => {
        let newSelectedList;
        const itemIndex = selectedDestinations.findIndex(loc => loc.idLocation === destination.idLocation);
        if (itemIndex >= 0) {
            newSelectedList = selectedDestinations.filter((item, index) => index !== itemIndex);
        } else {
            newSelectedList = [...selectedDestinations, destination];
        }
        setSelectedDestinations(newSelectedList);
    }

    const onDepartureSelection = (depr: Location, type: 'PLANE' | 'BUS') => {
        let newSelectedList;

        const searchList = type === 'PLANE' ? selectedPlaneDepartures : selectedBusDepartures;

        const itemIndex = searchList.findIndex(loc => loc.idLocation === depr.idLocation);
        if (itemIndex >= 0) {
            newSelectedList = searchList.filter((_, index) => index !== itemIndex);
        } else {
            newSelectedList = [...searchList, depr];
        }

        if (type == 'PLANE') {
            setSelectedPlaneDepartures(newSelectedList);
        }
        else {
            setSelectedBusDepartures(newSelectedList);
        }
    }

    const onGuestsSelection = (key: 'adults' | 'teens' | 'kids' | 'infants', type: 'INC' | 'DEC') => {
        setSelectedGuests(prevState => {
            const newState = { ...prevState };
            if (type === 'INC') {
                newState[key] = (prevState[key] || 0) + 1;
            } else {
                if (prevState[key] > 0) {
                    newState[key] = prevState[key] - 1;
                }
            }
            return newState;
        });
    }

    const onDateSelection = (date: Date, type: 'FROM' | 'TO') => {
        if (type === 'FROM') {
            setSelectedDateFrom(date);
        }
        else {
            setSelectedDateTo(date);
        }
    }

    const loadDataFromStorage = () => {
        const searchParamsString = localStorage.getItem("searchParams") ?? 'notfound';
        if (searchParamsString === 'notfound') {
            clearSearchParameters();
            return;
        }

        const searchParams = JSON.parse(searchParamsString);

        setSelectedDestinations(searchParams.arrivals);
        setSelectedPlaneDepartures(searchParams.departurePlane);
        setSelectedBusDepartures(searchParams.departureBus);
        setSelectedGuests({
            adults: searchParams.adults,
            teens: searchParams.teens,
            kids: searchParams.kids,
            infants: searchParams.infants,
        });
        setSelectedDateFrom(new Date(searchParams.dateFrom));
        setSelectedDateTo(new Date(searchParams.dateTo));
    }

    useEffect(() => {
        getAvailableDestinations().then(r => r);
        loadDataFromStorage();
    }, []);

    const clearSearchParameters = () => {
        localStorage.setItem('searchParams',
            JSON.stringify({
                departurePlane: [],
                departureBus: [],
                arrivals: [],
                dateFrom: '2024-05-01',
                dateTo: '2024-05-03',
                adults: 2,
                teens: 0,
                kids: 0,
                infants: 0,
            }));
        setSelectedPlaneDepartures([]);
        setSelectedBusDepartures([]);
        setSelectedDestinations([]);
        setSelectedDateTo(new Date(2024, 4, 3));
        setSelectedDateFrom(new Date(2024, 4, 1));
        setSelectedGuests({
            adults: 2,
            teens: 0,
            kids: 0,
            infants: 0,
        });
    }


    const handleSearch = () => {
        localStorage.setItem('searchParams',
            JSON.stringify({
                departurePlane: selectedPlaneDepartures,
                departureBus: selectedBusDepartures,
                arrivals: selectedDestinations,
                dateFrom: selectedDateFrom,
                dateTo: selectedDateTo,
                adults: selectedGuests.adults,
                teens: selectedGuests.teens,
                kids: selectedGuests.kids,
                infants: selectedGuests.infants,
            }));

        onSearch();
    }

    return(
        <ClickAwayListener onClickAway={() => setAnchorEl(null)}>
            <div>
                <div
                    className='bg-white flex items-center justify-around gap-14 rounded-xl border-gray-400 px-8 py-2.5 mb-4'
                    style={{borderWidth: 1,}}>
                    <Button
                        variant='outlined'
                        size='large'
                        sx={Boolean(anchorEl) && anchorType == 'destination' ? {
                            backgroundColor: '#556cd6',
                            color: '#fff',
                            '&:hover': {backgroundColor: '#556cd6'}
                        } : {}}
                        onClick={event => handleClick(event, 'destination')}
                        endIcon={<ArrowDropDown/>}
                    >
                        Cele podróży
                    </Button>
                    <Popper open={Boolean(anchorEl) && anchorType == 'destination'} anchorEl={anchorEl}>
                        <SearchDestinationsPopper
                            destinations={arrivals}
                            selectedDestinations={selectedDestinations}
                            onSelection={onDestinationSelection}
                        />
                    </Popper>

                    <Button
                        variant='outlined'
                        size='large'
                        sx={Boolean(anchorEl) && anchorType == 'guests' ? {
                            backgroundColor: '#556cd6',
                            color: '#fff',
                            '&:hover': {backgroundColor: '#556cd6'}
                        } : {}}
                        onClick={event => handleClick(event, 'guests')}
                        endIcon={<ArrowDropDown/>}
                    >
                        Ile osób
                    </Button>
                    <Popper open={Boolean(anchorEl) && anchorType == 'guests'} anchorEl={anchorEl}>
                        <SearchGuestQuantityPopper
                            onGuestsSelection={onGuestsSelection}
                            selectedGuests={selectedGuests}
                        />
                    </Popper>

                    <Button
                        variant='outlined'
                        size='large'
                        sx={Boolean(anchorEl) && anchorType == 'when' ? {
                            backgroundColor: '#556cd6',
                            color: '#fff',
                            '&:hover': {backgroundColor: '#556cd6'}
                        } : {}}
                        onClick={event => handleClick(event, 'when')}
                        endIcon={<ArrowDropDown/>}
                    >
                        Kiedy
                    </Button>
                    <Popper open={Boolean(anchorEl) && anchorType == 'when'} anchorEl={anchorEl}>
                        <SearchDateRangePopper
                            selectedDateFrom={selectedDateFrom}
                            selectedDateTo={selectedDateTo}
                            onSelection={onDateSelection}
                        />
                    </Popper>

                    <Button
                        variant='outlined'
                        size='large'
                        sx={Boolean(anchorEl) && anchorType == 'from' ? {
                            backgroundColor: '#556cd6',
                            color: '#fff',
                            '&:hover': {backgroundColor: '#556cd6'}
                        } : {}}
                        onClick={event => handleClick(event, 'from')}
                        endIcon={<ArrowDropDown/>}
                    >
                        Skąd
                    </Button>
                    <Popper open={Boolean(anchorEl) && anchorType == 'from'} anchorEl={anchorEl}>
                        <SearchDeparturesPopper
                            departures={departures}
                            selectedPlaneDepartures={selectedPlaneDepartures}
                            selectedBusDepartures={selectedBusDepartures}
                            onSelection={onDepartureSelection}
                        />
                    </Popper>

                    <IconButton color='default' aria-label='search' onClick={handleSearch}>
                        <SearchIcon style={{fontSize: 28}}/>
                    </IconButton>
                </div>

                {!hideClearSearch &&
                    <div className='mb-5'>
                        <Button color='error' className='flex flex-row items-center gap-1'
                                onClick={clearSearchParameters}>
                            <Close style={{fontSize: 18}}/>
                            <p className='text-sm'>Wyczyść parametry wyszukiwania</p>
                        </Button>
                    </div>
                }
            </div>
        </ClickAwayListener>
    );
}

export default SearchBar;
