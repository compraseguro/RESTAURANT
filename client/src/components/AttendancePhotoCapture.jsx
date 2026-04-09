import { useRef, useState, useCallback } from 'react';
import { MdCameraAlt, MdRefresh, MdPhotoCamera } from 'react-icons/md';

/**
 * JPEG data URL para el servidor (mín. ~120 chars en auth).
 */
function fileToJpegDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxW = 640;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        reject(new Error('Imagen no válida'));
        return;
      }
      const scale = w > maxW ? maxW / w : 1;
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, cw, ch);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

/**
 * Captura JPEG (data URL) para asistencia.
 * En iOS/Safari getUserMedia debe iniciarse en respuesta directa a un toque: no auto-arranque en mount.
 */
export default function AttendancePhotoCapture({ onCapture, disabled, className = '' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [streamReady, setStreamReady] = useState(false);
  const [starting, setStarting] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStreamReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError('');
    setStarting(true);
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStreamReady(true);
    } catch {
      setError('No se pudo usar la cámara. Use “Tomar foto” abajo o permita el acceso en Ajustes.');
      setStreamReady(false);
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

  const onFilePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    setError('');
    try {
      const dataUrl = await fileToJpegDataUrl(file);
      setPreview(dataUrl);
      stopStream();
      onCapture?.(dataUrl);
    } catch {
      setError('No se pudo procesar la imagen. Intente otra foto.');
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <p className="text-sm text-[#BFDBFE] leading-snug">
        {preview ? (
          <>Revise la foto y pulse «Ingresar al sistema» abajo, o tome otra.</>
        ) : (
          <>
            1) Pulse <strong className="text-white">Activar cámara</strong> y luego <strong className="text-white">Capturar foto</strong>.
            {' '}
            2) O use <strong className="text-white">Tomar foto</strong> para abrir la cámara o galería del teléfono.
          </>
        )}
      </p>

      {error && (
        <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">{error}</p>
      )}

      {!preview ? (
        <>
          {!streamReady ? (
            <div className="space-y-3">
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={(e) => void onFilePick(e)}
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#3B82F6]/50 text-[#F9FAFB] font-medium text-sm hover:bg-[#3B82F6]/15"
              >
                <MdPhotoCamera className="text-xl" /> Tomar foto / elegir imagen
              </button>
            </div>
          ) : (
            <>
              <div className="relative rounded-xl overflow-hidden bg-black/40 border border-[#3B82F6]/30 aspect-[4/3] max-h-64 min-h-[160px]">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
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
          <div className="rounded-xl overflow-hidden border border-[#3B82F6]/30 aspect-[4/3] max-h-64 min-h-[160px] bg-black/40">
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
