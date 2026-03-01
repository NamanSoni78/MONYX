importScripts('https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js');

self.onmessage = async function(e) {
  const { wavBlob, bitrate } = e.data;

  if (!wavBlob) {
      self.postMessage({ error: 'No WAV blob provided' });
      return;
  }

  try {
      const arrayBuffer = await wavBlob.arrayBuffer();
      const view = new DataView(arrayBuffer);

      // Basic WAV parsing (assuming 16-bit PCM, stereo)
      const channels = view.getUint16(22, true);
      const sampleRate = view.getUint32(24, true);

      // Locate data chunk
      let offset = 12;
      while (offset < view.byteLength) {
          const chunkId = String.fromCharCode(
              view.getUint8(offset), view.getUint8(offset+1),
              view.getUint8(offset+2), view.getUint8(offset+3)
          );
          const chunkSize = view.getUint32(offset + 4, true);
          if (chunkId === 'data') {
              offset += 8;
              break;
          }
          offset += 8 + chunkSize;
      }

      const pcmData = new Int16Array(arrayBuffer.slice(offset));

      // Separate channels if stereo
      let left, right;
      if (channels === 2) {
          left = new Int16Array(pcmData.length / 2);
          right = new Int16Array(pcmData.length / 2);
          for (let i = 0; i < left.length; i++) {
              left[i] = pcmData[i * 2];
              right[i] = pcmData[i * 2 + 1];
          }
      } else {
          left = pcmData;
          right = pcmData;
      }

      // @ts-ignore
      const lib = self.lamejs;
      const mp3encoder = new lib.Mp3Encoder(channels, sampleRate, bitrate || 128);

      const mp3Data = [];
      const sampleBlockSize = 1152;

      const totalBlocks = Math.ceil(left.length / sampleBlockSize);
      let processed = 0;

      for (let i = 0; i < left.length; i += sampleBlockSize) {
          const l = left.subarray(i, i + sampleBlockSize);
          const r = right.subarray(i, i + sampleBlockSize);
          const mp3buf = mp3encoder.encodeBuffer(l, r);
          if (mp3buf.length > 0) mp3Data.push(mp3buf);

          processed++;
          if (processed % 100 === 0) {
              self.postMessage({ progress: processed / totalBlocks });
          }
      }

      const endBuf = mp3encoder.flush();
      if (endBuf.length > 0) mp3Data.push(endBuf);

      self.postMessage({ progress: 1.0 });
      const blob = new Blob(mp3Data, { type: 'audio/mp3' });
      self.postMessage({ blob });

  } catch (err) {
      self.postMessage({ error: String(err) });
  }
};
