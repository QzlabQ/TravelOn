import OfferComponent from "../components/OfferComponent";
import {useEffect, useState} from "react";
import {ApiRequests, GetOffersBySearchQueryOffer} from "../../core/apiConfig";
import {SentimentVeryDissatisfied} from "@mui/icons-material";
import SearchBar from "../../home/components/SearchBar";
import {Location} from "../../core/domain/DomainInterfaces";
import {formatDate} from "../../core/utils";
import {Box, LinearProgress} from "@mui/material";

const Offers = () => {

    const [offers, setOffers] = useState<GetOffersBySearchQueryOffer[]>([]);

    const [noResults, setNoResults] = useState(false);

    const [error, setError] = useState(false);

    const [loading, setLoading] = useState(false);

    const searchOffers = async () => {
        setLoading(true);
        let searchParams = JSON.parse(localStorage.getItem("searchParams") ?? '{}');

        searchParams = {...searchParams,
            departurePlane: searchParams.departurePlane ? searchParams.departurePlane.map((dpt: Location) => dpt.idLocation) : [],
            departureBus: searchParams.departureBus ? searchParams.departureBus.map((dpt: Location) => dpt.idLocation) : [],
            arrivals: searchParams.arrivals ? searchParams.arrivals.map((dst: Location) => dst.idLocation) : [],
            dateFrom: formatDate(searchParams.dateFrom ? new Date(searchParams.dateFrom) : new Date()),
            dateTo: formatDate(searchParams.dateFrom ? new Date(searchParams.dateTo) : new Date()),
        }

        ApiRequests.getOffersBySearchQuery(searchParams)
            .then(response => {
                setOffers(response.data);
                setNoResults(response.data.length === 0);
                setLoading(false);
            })
            .catch(e => {
                console.log(e);
                setLoading(false);
                setError(true);
            });
    }

    useEffect(() => {
        searchOffers().then(r => r);
    }, []);

    return(
        <div className='flex flex-col py-16 px-[28rem] justify-center'>
            <SearchBar
                onSearch={searchOffers}
            />

            <Box sx={{height: 5}} className='mb-7'>
                {loading &&
                    <LinearProgress/>
                }
            </Box>

            {offers
                .sort((a, b) => a.price > b.price ? 1 : -1)
                .map((offer, index) => (
                    <OfferComponent
                        idHotel={offer.idHotel}
                        name={offer.hotelName}
                        key={offer.hotelName}
                        location={offer.destination}
                        rating={offer.rating}
                        pricePerPerson={Math.ceil(offer.price)}
                        photoURL={offer.imageUrl}
                        bestSeller={index < 3}
                    />
                ))}

            {noResults &&
                <div className='flex flex-col gap-4 mt-4'>
                    <div className='flex flex-row items-center gap-2'>
                        <SentimentVeryDissatisfied style={{fontSize: 36}}/>
                        <p className='text-2xl'>Nie znaleziono żadnych ofert</p>
                    </div>
                    <p>Zmień parametry wyszukiwania i spróbuj ponownie...</p>
                </div>
            }

            {error &&
                <div className='flex flex-col gap-4 mt-4'>
                    <div className='flex flex-row items-center gap-2'>
                        <SentimentVeryDissatisfied style={{fontSize: 36}}/>
                        <p className='text-2xl'>Wystąpił nieoczekiwany błąd</p>
                    </div>
                    <p>Spróbuj ponownie za chwilę...</p>
                </div>
            }
        </div>
    );
}

export default Offers;
