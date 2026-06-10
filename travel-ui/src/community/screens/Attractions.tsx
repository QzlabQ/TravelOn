import React from "react";
import {Chip} from "@mui/material";
import {Landscape} from "@mui/icons-material";
import AttractionsBrowser from "../components/AttractionsBrowser";

const Attractions = () => (
    <div className="min-h-screen bg-[#f6f7fb]">
        <section className="border-b border-slate-200 bg-white">
            <div className="mx-auto max-w-7xl px-6 py-8">
                <Chip icon={<Landscape/>} label="景点" color="primary" variant="outlined"/>
                <h1 className="mt-4 text-4xl font-bold tracking-normal text-slate-950">景点评价</h1>
                <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">
                    先选择城市，发现当地最热门的景点，或按名称、描述搜索你感兴趣的去处。
                </p>
            </div>
        </section>

        <main className="mx-auto max-w-7xl px-6 py-8">
            <AttractionsBrowser/>
        </main>
    </div>
);

export default Attractions;
