export async function exportProjectMp3(wavBlob: Blob, bitrate: number = 128, onProgress?: (p: number) => void): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const worker = new Worker('/mp3-worker.js');
        worker.onmessage = (e) => {
            if (e.data.error) {
                reject(e.data.error);
                worker.terminate();
            } else if (e.data.progress !== undefined) {
                if (onProgress) onProgress(e.data.progress);
            } else if (e.data.blob) {
                resolve(e.data.blob);
                worker.terminate();
            }
        };
        worker.onerror = (e) => {
            reject(e.message);
            worker.terminate();
        };
        worker.postMessage({ wavBlob, bitrate });
    });
}
