import React from "react";
import { Checkbox, FormControlLabel, FormGroup, Paper } from "@mui/material";
import {Location} from "../../core/domain/DomainInterfaces";

interface SearchDestinationsPopperProps {
    destinations: Location[];
    selectedDestinations: Location[];
    onSelection: (dst: Location) => void;
}

const SearchDestinationsPopper: React.FC<SearchDestinationsPopperProps> = ({ destinations, selectedDestinations, onSelection}) => {

    return (
        <Paper className='px-10 py-5 mt-2' style={{ maxHeight: '520px', overflowY: 'auto' }}>
            <div className='flex flex-row gap-10'>
                <div>
                    <FormGroup>
                        <div className='grid grid-cols-3 gap-x-4'>
                            {destinations.map((destination, index) => (
                                <FormControlLabel key={index} className='select-none' control={
                                    <Checkbox
                                        onChange={() => onSelection(destination)}
                                        checked={selectedDestinations.some(location => location.idLocation === destination.idLocation)}
                                    />
                                } label={destination.region} />
                            ))}
                        </div>
                    </FormGroup>
                </div>
            </div>
        </Paper>
    );
}

export default SearchDestinationsPopper;
