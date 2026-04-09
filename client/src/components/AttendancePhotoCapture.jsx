import { useRef, useState, useCallback, useLayoutEffect } from 'react';
import { MdCameraAlt, MdRefresh } from 'react-icons/md';

/**
 * Solo cámara en vivo (getUserMedia). Sin galería ni archivos — la foto debe tomarse en el momento.
 * El stream se enlaza en useLayoutEffect cuando el <video> ya está en el DOM (evita pantalla negra).
 */
export default function AttendancePhotoCapture({ onCapture, disabled, className = '' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [streamReady, setStreamReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [liveStream, setLiveStream] = useState(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLiveStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
    setStreamReady(false);
  }, []);

  useLayoutEffect(() => {
    if (!streamReady || !liveStream || !videoRef.current) return undefined;
    const v = videoRef.current;
    v.srcObject = liveStream;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.muted = true;
    const p = v.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
    return undefined;
  }, [streamReady, liveStream]);

  const startCamera = useCallback(async () => {
    setError('');
    setStarting(true);
    stopStream();
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      setLiveStream(stream);
      setStreamReady(true);
    } catch {
      setError('Permita el acceso a la cámara en el navegador o en Ajustes del teléfono, y vuelva a intentar.');
      setStreamReady(false);
      setLiveStream(null);
    } finally {
      setStarting(false);
    }
  }, [stopStream]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    const maxW = 640;
    const scale = w > maxW ? maxW / w : 1;
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, cw, ch);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    setPreview(dataUrl);
    stopStream();
    onCapture?.(dataUrl);
  }, [onCapture, stopStream]);

  const retake = () => {
    setPreview(null);
    onCapture?.(null);
    setError('');
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {error && (
        <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">{error}</p>
      )}

      {!preview ? (
        <>
          {!streamReady ? (
            <button
              type="button"
              disabled={disabled || starting}
              onClick={() => void startCamera()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#2563EB] text-white font-semibold text-base hover:bg-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#2563EB]/25"
            >
              {starting ? (
                <>
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                  Abriendo cámara…
                </>
              ) : (
                <>
                  <MdCameraAlt className="text-xl" /> Activar cámara
                </>
              )}
            </button>
          ) : (
            <>
              <div
                className="relative w-full rounded-xl overflow-hidden border border-[#3B82F6]/40 bg-black"
                style={{ minHeight: 'min(50vh, 320px)', height: 'min(50vh, 320px)' }}
              >
                <video
                  ref={videoRef}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                  playsInline
                  muted
                  autoPlay
                />
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={capture}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#2563EB] text-white font-medium text-sm hover:bg-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <MdCameraAlt className="text-lg" /> Capturar foto
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  stopStream();
                  setError('');
                }}
                className="w-full text-sm text-[#93C5FD] hover:text-white py-1"
              >
                Cancelar cámara
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <div
            className="rounded-xl overflow-hidden border border-[#3B82F6]/30 bg-black mx-auto max-w-full"
            style={{ minHeight: 'min(40vh, 260px)', maxHeight: 'min(50vh, 320px)' }}
          >
            <img src={preview} alt="" className="w-full h-full object-contain max-h-[min(50vh,320px)]" />
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={retake}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[#3B82F6]/40 text-[#F9FAFB] text-sm hover:bg-[#3B82F6]/15"
          >
            <MdRefresh className="text-lg" /> Tomar otra foto
          </button>
        </>
      )}
    </div>
  );
}
