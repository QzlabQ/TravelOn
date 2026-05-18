import React from 'react';
import {Box, Typography, Button, Card, CardContent, CardMedia, Chip, Paper} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import {Place, Recommend, SentimentVerySatisfied, ThumbUp} from "@mui/icons-material";
import {Link} from "react-router-dom";

interface OfferProps {
    idHotel: string,
    name: string;
    location: string;
    rating: number;
    pricePerPerson: number;
    photoURL?: string;
    bestSeller?: boolean;
}

const OfferComponent: React.FC<OfferProps> = ({idHotel, name, location, rating, pricePerPerson, photoURL, bestSeller}) => {
    return (
        <Card sx={{ display: 'flex', marginBottom: 2, borderRadius: 2, borderColor: 'grey.300', borderWidth: 1, borderStyle: 'solid'}}>
            <div className='relative pointer-events-none'>
                <CardMedia
                    component="img"
                    sx={{width: 320, height: 180}}
                    image={photoURL ?? require('../../assets/holiday-assets/dahee-son-tMffGE7u1bI-unsplash.jpg')}
                    alt="Ibiza Gwiździny"
                />
                {bestSeller &&
                    <Paper elevation={2} className='absolute top-3 right-3'>
                        <div className='flex flex-row rounded-xl items-center bg-white px-1.5 py-0.5'>
                            <SentimentVerySatisfied style={{fontSize: 20}}/>
                            <p className='text-sm ml-1 mr-0.5'>BESTSELLER</p>
                        </div>
                    </Paper>
                }
            </div>
            <div className='flex flex-1 flex-col justify-between px-8 py-6'>
                <Link
                    to='/offerDetails'
                    state={{idHotel: idHotel, name: name, hotelLocation: location, rating: rating, pricePerPerson: pricePerPerson, photoURL: photoURL}}
                    className='flex flex-col gap-3 group'>
                    <div className='flex flex-row items-center'>
                        <Place style={{fontSize: 18}} className='group-hover:text-gray-700'/>
                        <h4 className='text-sm ml-1 group-hover:text-gray-700'>
                            {location}
                        </h4>
                    </div>
                    <h3 className='text-2xl group-hover:text-gray-700'>
                        {name}
                    </h3>
                </Link>
                <Box sx={{display: 'flex', alignItems: 'center'}}>
                    <StarIcon sx={{color: 'gold', mr: 0.5}}/>
                    <p className='text-sm text-gray-600'>
                        {rating}
                    </p>
                </Box>
            </div>
            <div className='flex flex-col justify-between px-6 py-6'>
                <div className='flex flex-row items-center justify-end'>
                    <p className='mr-1 text-sm'>
                        do
                    </p>
                    <p className='text-xl font-semibold'>
                        {pricePerPerson.toLocaleString().replace(',', ' ')} zł
                    </p>
                    <p className='ml-1 text-sm'>
                        /os
                    </p>
                </div>
                <Link
                    to='/offerDetails'
                    state={{idHotel: idHotel, name: name, hotelLocation: location, rating: rating, pricePerPerson: pricePerPerson, photoURL: photoURL}}>
                    <Button variant="contained" color="primary">
                        Szczegóły
                    </Button>
                </Link>
            </div>
        </Card>
    );
}

export default OfferComponent;
