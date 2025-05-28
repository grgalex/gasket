essyFFT = require('essy-fft')
 
const fftSize    = 0;
const timeData   = new Float32Array([0.1, 0.2, 0.3, 0.4]);
const magnitudes = essyFFT.rfft(fftSize, timeData);
