class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    async play(url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            const source = this.ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.ctx.destination);
            source.start(0);
        } catch (e) {
            console.error("Audio failed", e);
        }
    }
}

export const audio = new AudioManager();