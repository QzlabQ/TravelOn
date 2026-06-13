import HomeSearchPanel from "../../home/components/HomeSearchPanel";
import FeaturedAttractions from "../../home/components/FeaturedAttractions";

export default function Home () {

    return(
        <div
            className='flex flex-col px-20 py-32 items-center homeContainer'
        >
            <div className='flex flex-col text-center gap-12 mb-16'>
                <h1 className='text-5xl font-bold tracking-wide text-gray-900'>探索，发现，旅行</h1>
                <h3 className='text-gray-700'>发现我们精心挑选的旅行体验，深入世界上最迷人的目的地，预订令人难忘的住宿。</h3>
            </div>

            <HomeSearchPanel/>

            <FeaturedAttractions/>
        </div>
    );
}
