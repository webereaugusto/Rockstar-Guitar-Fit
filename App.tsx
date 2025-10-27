/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, ChangeEvent, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { generateGuitarImage } from './services/geminiService';
import PolaroidCard from './components/PolaroidCard';
import { createAlbumPage } from './lib/albumUtils';
import Footer from './components/Footer';
import { cn } from './lib/utils';

const ALL_GUITAR_MODELS = [
    'Fender Stratocaster', 'Gibson Les Paul', 'Fender Telecaster', 'Ibanez JEM',
    'Gibson ES-335', 'Gibson Flying V', 'PRS Custom 24', 'Suhr Classic S',
    'ESP Eclipse', 'Tagima T-635', "Giannini Supersonic '70s", 'Washburn N4',
    'Fender SRV Stratocaster', 'Gibson Zakk Wylde LP'
];


// Pre-defined positions for a scattered look on desktop
const POSITIONS = [
    { top: '5%', left: '10%', rotate: -8 },
    { top: '15%', left: '60%', rotate: 5 },
    { top: '45%', left: '5%', rotate: 3 },
    { top: '2%', left: '35%', rotate: 10 },
    { top: '40%', left: '70%', rotate: -12 },
    { top: '50%', left: '38%', rotate: -3 },
];

const GHOST_POLAROIDS_CONFIG = [
  { initial: { x: "-150%", y: "-100%", rotate: -30 }, transition: { delay: 0.2 } },
  { initial: { x: "150%", y: "-80%", rotate: 25 }, transition: { delay: 0.4 } },
  { initial: { x: "-120%", y: "120%", rotate: 45 }, transition: { delay: 0.6 } },
  { initial: { x: "180%", y: "90%", rotate: -20 }, transition: { delay: 0.8 } },
  { initial: { x: "0%", y: "-200%", rotate: 0 }, transition: { delay: 0.5 } },
  { initial: { x: "100%", y: "150%", rotate: 10 }, transition: { delay: 0.3 } },
];


type ImageStatus = 'pending' | 'done' | 'error';
interface GeneratedImage {
    status: ImageStatus;
    url?: string;
    error?: string;
}

const primaryButtonClasses = "font-permanent-marker text-xl text-center text-black bg-yellow-400 py-3 px-8 rounded-sm transform transition-transform duration-200 hover:scale-105 hover:-rotate-2 hover:bg-yellow-300 shadow-[2px_2px_0px_2px_rgba(0,0,0,0.2)]";
const secondaryButtonClasses = "font-permanent-marker text-xl text-center text-white bg-white/10 backdrop-blur-sm border-2 border-white/80 py-3 px-8 rounded-sm transform transition-transform duration-200 hover:scale-105 hover:rotate-2 hover:bg-white hover:text-black";

const useMediaQuery = (query: string) => {
    const [matches, setMatches] = useState(false);
    useEffect(() => {
        const media = window.matchMedia(query);
        if (media.matches !== matches) {
            setMatches(media.matches);
        }
        const listener = () => setMatches(media.matches);
        window.addEventListener('resize', listener);
        return () => window.removeEventListener('resize', listener);
    }, [matches, query]);
    return matches;
};

function App() {
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [generatedImages, setGeneratedImages] = useState<Record<string, GeneratedImage>>({});
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isDownloading, setIsDownloading] = useState<boolean>(false);
    const [selectedGuitars, setSelectedGuitars] = useState<string[]>([]);
    const [appState, setAppState] = useState<'selecting-guitars' | 'idle' | 'image-uploaded' | 'generating' | 'results-shown'>('selecting-guitars');
    const dragAreaRef = useRef<HTMLDivElement>(null);
    const isMobile = useMediaQuery('(max-width: 768px)');

    const handleGuitarSelection = (guitarModel: string) => {
        setSelectedGuitars(prev => {
            const isSelected = prev.includes(guitarModel);
            if (isSelected) {
                return prev.filter(g => g !== guitarModel);
            } else {
                if (prev.length < 6) {
                    return [...prev, guitarModel];
                }
                return prev;
            }
        });
    };

    const handleSelectionContinue = () => {
        if (selectedGuitars.length === 6) {
            setAppState('idle');
        }
    };

    const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setUploadedImage(reader.result as string);
                setAppState('image-uploaded');
                setGeneratedImages({}); // Clear previous results
            };
            reader.readAsDataURL(file);
        }
    };

    const handleGenerateClick = async () => {
        if (!uploadedImage) return;

        setIsLoading(true);
        setAppState('generating');
        
        const initialImages: Record<string, GeneratedImage> = {};
        selectedGuitars.forEach(guitarModel => {
            initialImages[guitarModel] = { status: 'pending' };
        });
        setGeneratedImages(initialImages);

        const concurrencyLimit = 2;
        const modelsQueue = [...selectedGuitars];

        const processModel = async (guitarModel: string) => {
            try {
                const prompt = `Reimagine the person in this photo as a rockstar on stage, playing a ${guitarModel}. The scene should have dramatic lighting and a concert atmosphere. The output must be a high-quality, photorealistic image that clearly shows the person's face and the iconic guitar.`;
                const resultUrl = await generateGuitarImage(uploadedImage, prompt, guitarModel);
                setGeneratedImages(prev => ({
                    ...prev,
                    [guitarModel]: { status: 'done', url: resultUrl },
                }));
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
                setGeneratedImages(prev => ({
                    ...prev,
                    [guitarModel]: { status: 'error', error: errorMessage },
                }));
                console.error(`Failed to generate image for ${guitarModel}:`, err);
            }
        };

        const workers = Array(concurrencyLimit).fill(null).map(async () => {
            while (modelsQueue.length > 0) {
                const guitarModel = modelsQueue.shift();
                if (guitarModel) {
                    await processModel(guitarModel);
                }
            }
        });

        await Promise.all(workers);

        setIsLoading(false);
        setAppState('results-shown');
    };

    const handleRegenerateModel = async (guitarModel: string) => {
        if (!uploadedImage) return;

        if (generatedImages[guitarModel]?.status === 'pending') {
            return;
        }
        
        setGeneratedImages(prev => ({
            ...prev,
            [guitarModel]: { status: 'pending' },
        }));

        try {
            const prompt = `Reimagine the person in this photo as a rockstar on stage, playing a ${guitarModel}. The scene should have dramatic lighting and a concert atmosphere. The output must be a high-quality, photorealistic image that clearly shows the person's face and the iconic guitar.`;
            const resultUrl = await generateGuitarImage(uploadedImage, prompt, guitarModel);
            setGeneratedImages(prev => ({
                ...prev,
                [guitarModel]: { status: 'done', url: resultUrl },
            }));
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setGeneratedImages(prev => ({
                ...prev,
                [guitarModel]: { status: 'error', error: errorMessage },
            }));
            console.error(`Failed to regenerate image for ${guitarModel}:`, err);
        }
    };
    
    const handleReset = () => {
        setUploadedImage(null);
        setGeneratedImages({});
        setSelectedGuitars([]);
        setAppState('selecting-guitars');
    };

    const handlePhotoReset = () => {
        setUploadedImage(null);
        setAppState('idle');
    }

    const handleDownloadIndividualImage = (guitarModel: string) => {
        const image: GeneratedImage | undefined = generatedImages[guitarModel];
        if (image?.status === 'done' && image.url) {
            const link = document.createElement('a');
            link.href = image.url;
            link.download = `rockstar-portrait-${guitarModel.toLowerCase().replace(/\s+/g, '-')}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const handleDownloadAlbum = async () => {
        setIsDownloading(true);
        try {
            const imageData = Object.entries(generatedImages)
                .filter(([, image]) => (image as GeneratedImage).status === 'done' && (image as GeneratedImage).url)
                .reduce((acc, [guitarModel, image]) => {
                    acc[guitarModel] = (image as GeneratedImage)!.url!;
                    return acc;
                }, {} as Record<string, string>);

            if (Object.keys(imageData).length < selectedGuitars.length) {
                alert("Please wait for all images to finish generating before downloading the album.");
                return;
            }

            const albumDataUrl = await createAlbumPage(imageData);

            const link = document.createElement('a');
            link.href = albumDataUrl;
            link.download = 'rockstar-portrait-album.jpg';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error("Failed to create or download album:", error);
            alert("Sorry, there was an error creating your album. Please try again.");
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <main className="bg-black text-neutral-200 min-h-screen w-full flex flex-col items-center justify-center p-4 pb-24 overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-full bg-grid-white/[0.05]"></div>
            
            <div className="z-10 flex flex-col items-center justify-center w-full h-full flex-1 min-h-0">
                <div className="text-center mb-10">
                    <h1 className="text-6xl md:text-8xl font-caveat font-bold text-neutral-100">Rockstar Portrait</h1>
                    {appState !== 'selecting-guitars' && (
                       <p className="font-permanent-marker text-neutral-300 mt-2 text-xl tracking-wide">Shred your way through iconic guitar history.</p>
                    )}
                </div>

                {appState === 'selecting-guitars' && (
                     <motion.div
                        className="flex flex-col items-center"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <h2 className="font-permanent-marker text-3xl text-yellow-400 mb-2">Choose your 6-string lineup</h2>
                        <p className="text-neutral-400 mb-8">Select 6 iconic guitars to start your rockstar transformation.</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-4xl mb-8">
                            {ALL_GUITAR_MODELS.map(model => {
                                const isSelected = selectedGuitars.includes(model);
                                const isDisabled = !isSelected && selectedGuitars.length >= 6;
                                return (
                                    <button
                                        key={model}
                                        onClick={() => handleGuitarSelection(model)}
                                        disabled={isDisabled}
                                        className={cn(
                                            "p-4 border-2 rounded-md font-permanent-marker text-center transition-all duration-200",
                                            isSelected
                                                ? "bg-yellow-400 text-black border-yellow-400 scale-105"
                                                : "bg-white/5 border-white/20 text-white hover:border-white/50 hover:bg-white/10",
                                            isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                                        )}
                                    >
                                        {model}
                                    </button>
                                )
                            })}
                        </div>
                        <button
                            onClick={handleSelectionContinue}
                            disabled={selectedGuitars.length !== 6}
                            className={cn(primaryButtonClasses, "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:rotate-0 disabled:hover:bg-yellow-400/50")}
                        >
                            Continue ({selectedGuitars.length}/6)
                        </button>
                    </motion.div>
                )}


                {appState === 'idle' && (
                     <div className="relative flex flex-col items-center justify-center w-full">
                        {GHOST_POLAROIDS_CONFIG.map((config, index) => (
                             <motion.div
                                key={index}
                                className="absolute w-80 h-[26rem] rounded-md p-4 bg-neutral-100/10 blur-sm"
                                initial={config.initial}
                                animate={{
                                    x: "0%", y: "0%", rotate: (Math.random() - 0.5) * 20,
                                    scale: 0,
                                    opacity: 0,
                                }}
                                transition={{
                                    ...config.transition,
                                    ease: "circOut",
                                    duration: 2,
                                }}
                            />
                        ))}
                        <motion.div
                             initial={{ opacity: 0, scale: 0.8 }}
                             animate={{ opacity: 1, scale: 1 }}
                             transition={{ delay: 2, duration: 0.8, type: 'spring' }}
                             className="flex flex-col items-center"
                        >
                            <label htmlFor="file-upload" className="cursor-pointer group transform hover:scale-105 transition-transform duration-300">
                                 <PolaroidCard 
                                     caption="Click to begin"
                                     status="done"
                                 />
                            </label>
                            <input id="file-upload" type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleImageUpload} />
                            <p className="mt-8 font-permanent-marker text-neutral-500 text-center max-w-xs text-lg">
                                Click the polaroid to upload your photo and become a guitar legend.
                            </p>
                            <button onClick={() => setAppState('selecting-guitars')} className="mt-4 text-neutral-400 hover:text-white underline">
                                Change Guitars
                            </button>
                        </motion.div>
                    </div>
                )}

                {appState === 'image-uploaded' && uploadedImage && (
                    <motion.div 
                        className="flex flex-col items-center gap-6"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4 }}
                    >
                         <PolaroidCard 
                            imageUrl={uploadedImage} 
                            caption="Your Photo" 
                            status="done"
                         />
                         <div className="flex items-center gap-4 mt-4">
                            <button onClick={handlePhotoReset} className={secondaryButtonClasses}>
                                Different Photo
                            </button>
                            <button onClick={handleGenerateClick} className={primaryButtonClasses}>
                                Generate
                            </button>
                         </div>
                         <button onClick={handleReset} className="mt-2 text-neutral-400 hover:text-white underline">
                            Change Guitars
                        </button>
                    </motion.div>
                )}

                {(appState === 'generating' || appState === 'results-shown') && (
                     <>
                        {isMobile ? (
                            <div className="w-full max-w-sm flex-1 overflow-y-auto mt-4 space-y-8 p-4">
                                {selectedGuitars.map((guitarModel) => (
                                    <div key={guitarModel} className="flex justify-center">
                                         <PolaroidCard
                                            caption={guitarModel}
                                            status={generatedImages[guitarModel]?.status || 'pending'}
                                            imageUrl={generatedImages[guitarModel]?.url}
                                            error={generatedImages[guitarModel]?.error}
                                            onShake={handleRegenerateModel}
                                            onDownload={handleDownloadIndividualImage}
                                            isMobile={isMobile}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div ref={dragAreaRef} className="relative w-full max-w-5xl h-[600px] mt-4">
                                {selectedGuitars.map((guitarModel, index) => {
                                    const { top, left, rotate } = POSITIONS[index];
                                    return (
                                        <motion.div
                                            key={guitarModel}
                                            className="absolute cursor-grab active:cursor-grabbing"
                                            style={{ top, left }}
                                            initial={{ opacity: 0, scale: 0.5, y: 100, rotate: 0 }}
                                            animate={{ 
                                                opacity: 1, 
                                                scale: 1, 
                                                y: 0,
                                                rotate: `${rotate}deg`,
                                            }}
                                            transition={{ type: 'spring', stiffness: 100, damping: 20, delay: index * 0.15 }}
                                        >
                                            <PolaroidCard 
                                                dragConstraintsRef={dragAreaRef}
                                                caption={guitarModel}
                                                status={generatedImages[guitarModel]?.status || 'pending'}
                                                imageUrl={generatedImages[guitarModel]?.url}
                                                error={generatedImages[guitarModel]?.error}
                                                onShake={handleRegenerateModel}
                                                onDownload={handleDownloadIndividualImage}
                                                isMobile={isMobile}
                                            />
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                         <div className="h-20 mt-4 flex items-center justify-center">
                            {appState === 'results-shown' && (
                                <div className="flex flex-col sm:flex-row items-center gap-4">
                                    <button 
                                        onClick={handleDownloadAlbum} 
                                        disabled={isDownloading} 
                                        className={`${primaryButtonClasses} disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {isDownloading ? 'Creating Album...' : 'Download Album'}
                                    </button>
                                    <button onClick={handleReset} className={secondaryButtonClasses}>
                                        Start Over
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
            <Footer />
        </main>
    );
}

export default App;