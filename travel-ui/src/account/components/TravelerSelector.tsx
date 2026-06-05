import React, {useEffect, useMemo, useState} from "react";
import {
    Alert,
    Button,
    Checkbox,
    Chip,
    FormControlLabel,
    MenuItem,
    TextField
} from "@mui/material";
import {Add, Person, PersonAdd} from "@mui/icons-material";
import {ApiRequests, BookingPersonPayload, TravelerResponse, TravelerType} from "../../core/apiConfig";
import {getCurrentUserSession} from "../../core/currentUser";

type TravelerSelectorProps = {
    title?: string;
    single?: boolean;
    onChange: (travelers: BookingPersonPayload[]) => void;
};

const typeLabel = (type: TravelerType) => {
    if (type === "CHILD") return "儿童";
    if (type === "STUDENT") return "学生";
    return "成人";
};

const toBookingPerson = (traveler: TravelerResponse): BookingPersonPayload => ({
    travelerId: traveler.id,
    name: traveler.name,
    travelerType: traveler.travelerType,
    documentType: traveler.documentType,
    documentNumber: traveler.documentNumber,
    phone: traveler.phone,
});

export default function TravelerSelector({title = "选择出行人", single = false, onChange}: TravelerSelectorProps) {
    const session = getCurrentUserSession();
    const [savedTravelers, setSavedTravelers] = useState<TravelerResponse[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [temporaryTravelers, setTemporaryTravelers] = useState<BookingPersonPayload[]>([]);
    const [name, setName] = useState("");
    const [travelerType, setTravelerType] = useState<TravelerType>("ADULT");
    const [loadingError, setLoadingError] = useState(false);

    useEffect(() => {
        if (!session) return;

        ApiRequests.listTravelers(session.token)
            .then(response => {
                setSavedTravelers(response.data);
                const preferred = response.data.find(item => item.defaultTraveler) ?? response.data[0];
                if (preferred) {
                    setSelectedIds([preferred.id]);
                }
            })
            .catch(() => setLoadingError(true));
    }, []);

    const selectedTravelers = useMemo(() => [
        ...savedTravelers.filter(item => selectedIds.includes(item.id)).map(toBookingPerson),
        ...temporaryTravelers
    ], [savedTravelers, selectedIds, temporaryTravelers]);

    useEffect(() => {
        onChange(selectedTravelers);
    }, [selectedTravelers]);

    const toggleSavedTraveler = (travelerId: string) => {
        setSelectedIds(previous => {
            if (single) {
                setTemporaryTravelers([]);
                return previous.includes(travelerId) ? [] : [travelerId];
            }
            return previous.includes(travelerId)
                ? previous.filter(id => id !== travelerId)
                : [...previous, travelerId];
        });
    };

    const addTemporaryTraveler = () => {
        const trimmedName = name.trim();
        if (!trimmedName) return;
        if (single) {
            setSelectedIds([]);
            setTemporaryTravelers([{name: trimmedName, travelerType}]);
        } else {
            setTemporaryTravelers(previous => [...previous, {name: trimmedName, travelerType}]);
        }
        setName("");
        setTravelerType("ADULT");
    };

    const removeTemporaryTraveler = (index: number) => {
        setTemporaryTravelers(previous => previous.filter((_, itemIndex) => itemIndex !== index));
    };

    return (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">{title}</h2>
                    <p className="mt-1 text-xs text-slate-500">订单会保存本次选择的人员快照</p>
                </div>
                <Chip size="small" icon={<Person/>} label={`${selectedTravelers.length} 人`}/>
            </div>

            {loadingError && <Alert severity="warning" className="mb-3">常用出行人读取失败，仍可临时填写。</Alert>}

            {savedTravelers.length > 0 &&
                <div className="mb-4 grid gap-2">
                    {savedTravelers.map(traveler => (
                        <label key={traveler.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
                            <FormControlLabel
                                className="m-0"
                                control={<Checkbox size="small" checked={selectedIds.includes(traveler.id)} onChange={() => toggleSavedTraveler(traveler.id)}/>}
                                label={<span className="text-sm font-semibold text-slate-800">{traveler.name}</span>}
                            />
                            <div className="flex gap-1">
                                {traveler.defaultTraveler && <Chip size="small" label="默认"/>}
                                <Chip size="small" variant="outlined" label={typeLabel(traveler.travelerType)}/>
                            </div>
                        </label>
                    ))}
                </div>
            }

            {temporaryTravelers.length > 0 &&
                <div className="mb-4 flex flex-wrap gap-2">
                    {temporaryTravelers.map((traveler, index) => (
                        <Chip
                            key={`${traveler.name}-${index}`}
                            color="primary"
                            variant="outlined"
                            label={`${traveler.name} · ${typeLabel(traveler.travelerType)}`}
                            onDelete={() => removeTemporaryTraveler(index)}
                        />
                    ))}
                </div>
            }

            <p className="mb-2 text-sm font-semibold text-slate-700">
                {session ? "临时增加本次出行人" : "填写本次出行人"}
            </p>
            <div className="grid grid-cols-[1fr_92px_40px] gap-2">
                <TextField size="small" label="姓名" value={name} onChange={event => setName(event.target.value)}/>
                <TextField select size="small" label="类型" value={travelerType} onChange={event => setTravelerType(event.target.value as TravelerType)}>
                    <MenuItem value="ADULT">成人</MenuItem>
                    <MenuItem value="CHILD">儿童</MenuItem>
                    <MenuItem value="STUDENT">学生</MenuItem>
                </TextField>
                <Button variant="outlined" sx={{minWidth: 40}} onClick={addTemporaryTraveler} title="添加出行人">
                    {session ? <Add/> : <PersonAdd/>}
                </Button>
            </div>
        </section>
    );
}
