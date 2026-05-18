import {useState} from "react";
import {Paper} from "@mui/material";
import {DatePicker} from "@mui/x-date-pickers";
import dayjs from "dayjs";

// @ts-ignore
const SearchDateRangePopper = ({selectedDateFrom, selectedDateTo, onSelection}) => {

    return(
        <Paper className='px-10 py-8 mt-2'>
            <div className='flex flex-col gap-4'>

                <DatePicker
                    label="Wyjazd"
                    value={dayjs(selectedDateFrom)}
                    onChange={(value) => onSelection(value?.toDate(), 'FROM')}
                />

                <DatePicker
                    label="Powrót"
                    value={dayjs(selectedDateTo)}
                    onChange={(value) => onSelection(value?.toDate(), 'TO')}
                />
            </div>
        </Paper>
    );
}

export default SearchDateRangePopper;
