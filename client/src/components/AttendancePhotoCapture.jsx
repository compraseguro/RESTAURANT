import { useRef, useEffect, useState, useCallback } from 'react';
import { MdCameraAlt, MdRefresh } from 'react-icons/md';

/**
 * Captura un JPEG comprimido (data URL) para registro de asistencia.
 * Requiere contexto seguro (HTTPS o localhost) para getUserMedia.
 */
export default function AttendancePhotoCapture({ onCapture, disabled, className = '' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        if (!cancelled) setError('No se pudo usar la cámara. Permita el acceso o abra el sitio por HTTPS.');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

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
    onCapture?.(dataUrl);
  }, [onCapture]);

  const retake = () => {
    setPreview(null);
    onCapture?.(null);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {error && (
        <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">{error}</p>
      )}
      {!preview ? (
        <>
          <div className="relative rounded-xl overflow-hidden bg-black/40 border border-[#3B82F6]/30 aspect-[4/3] max-h-56">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          </div>
          <button
            type="button"
            disabled={disabled || !!error}
            onClick={capture}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#2563EB] text-white font-medium text-sm hover:bg-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MdCameraAlt className="text-lg" /> Capturar foto
          </button>
        </>
      ) : (
        <>
          <div className="rounded-xl overflow-hidden border border-[#3B82F6]/30 aspect-[4/3] max-h-56 bg-black/40">
            <img src={preview} alt="Vista previa" className="w-full h-full object-cover" />
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
