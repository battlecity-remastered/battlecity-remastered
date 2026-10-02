export const createCannonAudio = (enabled: () => boolean) => {
    let context: AudioContext | null = null;
    let noise: AudioBuffer | null = null;
    const unlock = (): void => {
        if(!enabled() || !("AudioContext" in window)) return;
        if(!context) {
            context=new window.AudioContext();
            noise=context.createBuffer(1,Math.ceil(context.sampleRate*0.5),context.sampleRate);
            const samples=noise.getChannelData(0);
            for(let i=0;i<samples.length;i++) samples[i]=Math.random()*2-1;
        }
        if(context.state==="suspended") void context.resume().catch(()=>{});
    };
    window.addEventListener("keydown",unlock);
    window.addEventListener("pointerdown",unlock);

    const thump = (frequency: number,endFrequency: number,duration: number,volume: number,pan: number): void => {
        if(!context) return;
        const time=context.currentTime, oscillator=context.createOscillator(), gain=context.createGain(), stereo=context.createStereoPanner();
        oscillator.type="sine";
        oscillator.frequency.setValueAtTime(frequency,time);
        oscillator.frequency.exponentialRampToValueAtTime(endFrequency,time+duration);
        gain.gain.setValueAtTime(volume,time);
        gain.gain.exponentialRampToValueAtTime(0.0001,time+duration);
        stereo.pan.value=pan;
        oscillator.connect(gain); gain.connect(stereo); stereo.connect(context.destination);
        oscillator.start(time); oscillator.stop(time+duration);
        oscillator.onended=()=> { oscillator.disconnect();gain.disconnect();stereo.disconnect(); };
    };
    const transient = (frequency: number,duration: number,volume: number,pan: number): void => {
        if(!context || !noise) return;
        const time=context.currentTime, source=context.createBufferSource(), filter=context.createBiquadFilter(), gain=context.createGain(), stereo=context.createStereoPanner();
        source.buffer=noise; filter.type="lowpass";filter.frequency.value=frequency;
        gain.gain.setValueAtTime(volume,time);gain.gain.exponentialRampToValueAtTime(0.0001,time+duration);
        stereo.pan.value=pan;
        source.connect(filter);filter.connect(gain);gain.connect(stereo);stereo.connect(context.destination);
        source.start(time);source.stop(time+duration);
        source.onended=()=> { source.disconnect();filter.disconnect();gain.disconnect();stereo.disconnect(); };
    };
    return {
        fire: (volume = 1,pan = 0,weapon?: "cannon" | "rocket" | "laser"): void => {
            if(!enabled() || context?.state!=="running") return;
            if(weapon==="laser") {thump(1500,180,0.16,0.075*volume,pan);transient(6500,0.04,0.025*volume,pan);return;}
            if(weapon==="rocket")transient(900,0.35,0.08*volume,pan);
            thump(145,43,0.30,0.19*volume,pan);
            transient(2600,0.16,0.13*volume,pan);
            thump(570,250,0.06,0.035*volume,pan);
        },
        impact: (metal: boolean,distance: number,pan: number): void => {
            if(!enabled() || context?.state!=="running") return;
            const volume=0.10/(1+distance*0.20);
            transient(metal?3900:1700,metal?0.15:0.22,volume,pan);
            thump(metal?1100:110,metal?480:46,metal?0.13:0.20,volume*0.55,pan);
        },
        explosion:(distance:number,pan:number):void=>{
            if(!enabled() || context?.state!=="running")return;
            const volume=1/(1+distance*.12);
            thump(82,24,.85,.28*volume,pan);transient(1700,.48,.24*volume,pan);thump(180,36,.24,.12*volume,pan);transient(380,.5,.16*volume,pan);
        },
        dispose: (): void => {
            window.removeEventListener("keydown",unlock);window.removeEventListener("pointerdown",unlock);
            if(context && context.state!=="closed") void context.close().catch(()=>{});
        }
    };
};
