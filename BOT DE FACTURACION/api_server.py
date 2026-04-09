#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
API HTTP mínima para que el backend Node envíe ventas al bot (XML, firma, SUNAT, PDF).

Variables de entorno (además de las de `.env` del bot):
  EFACT_HTTP_SECRET   — si está definido, el header X-EFACT-SECRET debe coincidir (mismo valor que "Token API" en el panel).
  EFACT_HTTP_HOST     — default 127.0.0.1
  EFACT_HTTP_PORT     — default 8765

Ejecutar desde la carpeta del bot:
  python api_server.py
"""

from __future__ import annotations

import json
import logging
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from socketserver import ThreadingMixIn

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
except ImportError:
    pass

from main import procesar_venta, venta_desde_dict
from restaurant_efact.config import (
    AmbienteSunat,
    load_certificado_from_env,
    load_rutas_from_env,
    load_sunat_config_from_env,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("api_server")

SECRET = os.environ.get("EFACT_HTTP_SECRET", "").strip()


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        logger.info("%s - %s", self.address_string(), fmt % args)

    def _send_json(self, code: int, body: dict) -> None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path == "/health":
            self._send_json(200, {"ok": True, "service": "restaurant_efact_api"})
            return
        self._send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path != "/emitir":
            self._send_json(404, {"error": "not_found"})
            return

        if SECRET:
            if self.headers.get("X-EFACT-SECRET", "") != SECRET:
                self._send_json(401, {"ok": False, "error": "unauthorized"})
                return

        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception as e:
            self._send_json(400, {"ok": False, "error": "invalid_json", "detail": str(e)})
            return

        try:
            venta = venta_desde_dict(data)
        except Exception as e:
            logger.warning("Payload inválido: %s", e)
            self._send_json(400, {"ok": False, "error": "invalid_sale", "detail": str(e)})
            return

        rutas = load_rutas_from_env()
        cert_cfg = load_certificado_from_env()
        if cert_cfg and not cert_cfg.password_pfx:
            logger.warning("CERT_PFX_PASSWORD vacío; se omite firma SUNAT")
            cert_cfg = None
        if cert_cfg and not cert_cfg.ruta_pfx.exists():
            logger.warning("No existe CERT_PFX_PATH; se omite firma SUNAT")
            cert_cfg = None

        sunat_cfg = load_sunat_config_from_env()
        if sunat_cfg.ambiente == AmbienteSunat.PRODUCCION:
            logger.warning("Ambiente SUNAT PRODUCCIÓN activo.")

        enviar_sunat = cert_cfg is not None
        motivo_sin_firma = None if cert_cfg else "sin_certificado"

        try:
            result = procesar_venta(
                venta,
                rutas=rutas,
                cert_cfg=cert_cfg,
                sunat_cfg=sunat_cfg,
                enviar_sunat=enviar_sunat,
                motivo_sin_firma=motivo_sin_firma,
            )
        except Exception as e:
            logger.exception("Error procesando venta: %s", e)
            self._send_json(500, {"ok": False, "error": str(e)})
            return

        self._send_json(200, result)


def main() -> int:
    host = os.environ.get("EFACT_HTTP_HOST", "127.0.0.1")
    port = int(os.environ.get("EFACT_HTTP_PORT", "8765"))
    httpd = ThreadingHTTPServer((host, port), Handler)
    logger.info("API e-fact escuchando en http://%s:%s (POST /emitir, GET /health)", host, port)
    if SECRET:
        logger.info("Autenticación X-EFACT-SECRET activa")
    else:
        logger.warning("EFACT_HTTP_SECRET no definido: la API acepta peticiones sin token")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Detenido")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
