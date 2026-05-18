import {Checkbox, FormControlLabel, FormGroup, Paper} from "@mui/material";
import {DirectionsBus, Flight} from "@mui/icons-material";
import {Location} from "../../core/domain/DomainInterfaces";


// @ts-ignore
const SearchDeparturesPopper = ({departures, selectedPlaneDepartures, selectedBusDepartures, onSelection}) => {

    return (
        <Paper className='px-10 py-5 mt-2'>
            <div className='flex flex-row gap-10'>
                <div>
                    <div className='flex flex-row gap-2 items-center mb-2 ml-0.5'>
                        <Flight style={{fontSize: 16}}/>
                        <h3 className='text-xs'>WYLOT SAMOLOTEM</h3>
                    </div>

                    <FormGroup>
                        {departures.plane.map((depr: Location, index: number) => (
                            <FormControlLabel key={index} className='select-none' control={
                                <Checkbox checked={selectedPlaneDepartures.some((loc: Location) => loc.idLocation === depr.idLocation)} onChange={() => onSelection(depr, 'PLANE')} />
                            } label={depr.region} />
                        ))}
                    </FormGroup>
                </div>
                <div>
                    <div className='flex flex-row gap-2 items-center mb-2 ml-0.5'>
                        <DirectionsBus style={{fontSize: 16}}/>
                        <h3 className='text-xs'>WYJAZD BUSEM</h3>
                    </div>
                    <FormGroup>
                        <FormGroup>
                            {departures.bus.map((depr: Location, index: number) => (
                                <FormControlLabel key={index} className='select-none' control={
                                    <Checkbox checked={selectedBusDepartures.some((loc: Location) => loc.idLocation === depr.idLocation)} onChange={() => onSelection(depr, 'BUS')} />
                                } label={depr.region} />
                            ))}
                        </FormGroup>
                    </FormGroup>
                </div>
            </div>
        </Paper>
    );
}

export default SearchDeparturesPopper;
