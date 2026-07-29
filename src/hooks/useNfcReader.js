import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tap-to-identify via the Web NFC API (`NDEFReader`). This is Android-Chrome
 * only and requires HTTPS, so it's strictly a progressive enhancement:
 * `supported` gates the whole UI, and everywhere else the tap option is hidden.
 *
 * A tag can hold the customer's phone as a plain text or URL record; the raw
 * decoded text is handed to `onRead` and the caller extracts the phone with the
 * same `parsePhoneFromScan` used for QR, so tags and cards are interchangeable.
 */
export function useNfcReader(onRead) {
  const supported = typeof window !== 'undefined' && 'NDEFReader' in window;

  const readerRef = useRef(null);
  const abortRef = useRef(null);
  const onReadRef = useRef(onRead);
  useEffect(() => { onReadRef.current = onRead; });

  const [reading, setReading] = useState(false);
  const [error, setError] = useState(null);

  const stop = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    readerRef.current = null;
    setReading(false);
  }, []);

  const start = useCallback(async () => {
    if (!supported) { setError('unsupported'); return; }
    setError(null);
    try {
      // eslint-disable-next-line no-undef
      const reader = new NDEFReader();
      const controller = new AbortController();
      readerRef.current = reader;
      abortRef.current = controller;
      await reader.scan({ signal: controller.signal });
      setReading(true);

      reader.onreading = (event) => {
        const decoder = new TextDecoder();
        for (const record of event.message.records) {
          try {
            const text = decoder.decode(record.data);
            if (text) { stop(); onReadRef.current?.(text); return; }
          } catch {
            // Skip records we can't decode (e.g. non-text media types).
          }
        }
      };
      reader.onreadingerror = () => setError('read');
    } catch (err) {
      setError(err?.name === 'NotAllowedError' ? 'denied' : 'nfc');
      stop();
    }
  }, [supported, stop]);

  useEffect(() => stop, [stop]);

  return { supported, reading, error, start, stop };
}
