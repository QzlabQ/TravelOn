import SearchBar from "../../home/components/SearchBar";
import {useNavigate} from "react-router-dom";
import {useEffect, useState} from "react";
import Snackbar from "@mui/material/Snackbar";

export default function Home () {

    const navigate = useNavigate();

    const onSearch = () => {
        navigate('/offers');
    }

    return(
        <div
            className='flex flex-col px-20 py-32 items-center homeContainer'
        >
            <div className='flex flex-col text-center gap-12 mb-28'>
                <h1 className='text-5xl font-bold tracking-wide text-gray-900'>Eksploruj. Odkrywaj. Podróżuj.</h1>
                <h3 className='text-gray-700'>Odkryj nasze starannie wyselekcjonowane doświadczenia, zagłębiając się w najbardziej urzekające miejsca na świecie i rezerwuj zapadające w pamięć noclegi.</h3>
            </div>

            <SearchBar
                onSearch={onSearch}
                hideClearSearch
            />

            <div className='flex items-center gap-4 mt-32'>
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
    );
}
