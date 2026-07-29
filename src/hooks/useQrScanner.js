import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Camera QR scanning via the native BarcodeDetector API — no extra dependency,
 * available in Chromium (the POS tablet target). Feature-detected: on browsers
 * without it, `supported` is false and callers hide the scan option entirely.
 *
 * Usage: attach `videoRef` to a <video>, call `start()` to open the camera and
 * begin polling frames; `onDetect(rawText)` fires with the first decoded value.
 * The stream and polling loop are always torn down on stop/unmount.
 */
export function useQrScanner(onDetect) {
  const supported = typeof window !== 'undefined'
    && 'BarcodeDetector' in window
    && !!navigator.mediaDevices?.getUserMedia;

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);
  const onDetectRef = useRef(onDetect);
  useEffect(() => { onDetectRef.current = onDetect; });

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);

  const stop = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  const start = useCallback(async () => {
    if (!supported) { setError('unsupported'); return; }
    setError(null);
    try {
      detectorRef.current = detectorRef.current || new BarcodeDetector({ formats: ['qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();
      setScanning(true);

      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detectorRef.current.detect(videoRef.current);
          if (codes && codes.length > 0) {
            const value = codes[0].rawValue;
            stop();
            onDetectRef.current?.(value);
            return;
          }
        } catch {
          // A transient decode failure on one frame is expected — keep polling.
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setError(err?.name === 'NotAllowedError' ? 'denied' : 'camera');
      stop();
    }
  }, [supported, stop]);

  useEffect(() => stop, [stop]);

  return { supported, scanning, error, videoRef, start, stop };
}
