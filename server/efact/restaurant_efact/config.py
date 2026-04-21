"""
Configuración: credenciales SOL, certificado, URLs SUNAT y rutas de almacenamiento.
Cargar desde variables de entorno o .env (python-dotenv opcional).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class AmbienteSunat(str, Enum):
    BETA = "beta"
    PRODUCCION = "produccion"


# URLs oficiales BillService (comprobantes Factura/Boleta/NCR/NDB, etc.)
URLS_BILL_SERVICE = {
    AmbienteSunat.BETA: "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService",
    AmbienteSunat.PRODUCCION: "https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService",
}


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


@dataclass
class SunatConfig:
    """Credenciales y endpoint SOAP."""

    ruc: str
    usuario_sol: str
    clave_sol: str
    ambiente: AmbienteSunat = AmbienteSunat.BETA

    @property
    def soap_username(self) -> str:
        """SUNAT: usuario SOAP = RUC + usuario SOL (sin separador)."""
        return f"{self.ruc}{self.usuario_sol}"

    @property
    def bill_service_url(self) -> str:
        return URLS_BILL_SERVICE[self.ambiente]


@dataclass
class CertificadoConfig:
    """Certificado digital .pfx del contribuyente."""

    ruta_pfx: Path
    password_pfx: str


@dataclass
class RutasAlmacenamiento:
    """Carpetas para XML, firmados, CDR y PDF."""

    base: Path
    xml_sin_firma: Path = None  # type: ignore
    xml_firmado: Path = None  # type: ignore
    cdr: Path = None  # type: ignore
    pdf: Path = None  # type: ignore

    def __post_init__(self) -> None:
        b = Path(self.base)
        self.xml_sin_firma = b / "xml"
        self.xml_firmado = b / "signed"
        self.cdr = b / "cdr"
        self.pdf = b / "pdf"

    def ensure_all(self) -> None:
        for p in (self.xml_sin_firma, self.xml_firmado, self.cdr, self.pdf):
            p.mkdir(parents=True, exist_ok=True)


def load_sunat_config_from_env() -> SunatConfig:
    """Lee SUNAT_RUC, SUNAT_USUARIO_SOL, SUNAT_CLAVE_SOL, SUNAT_AMBIENTE."""
    amb = _env("SUNAT_AMBIENTE", "beta").lower()
    ambiente = AmbienteSunat.PRODUCCION if amb == "produccion" else AmbienteSunat.BETA
    return SunatConfig(
        ruc=_env("SUNAT_RUC"),
        usuario_sol=_env("SUNAT_USUARIO_SOL"),
        clave_sol=_env("SUNAT_CLAVE_SOL"),
        ambiente=ambiente,
    )


def load_certificado_from_env() -> CertificadoConfig:
    """Lee CERT_PFX_PATH, CERT_PFX_PASSWORD."""
    return CertificadoConfig(
        ruta_pfx=Path(_env("CERT_PFX_PATH", "./certs/emisor.pfx")),
        password_pfx=_env("CERT_PFX_PASSWORD"),
    )


def load_rutas_from_env() -> RutasAlmacenamiento:
    """Lee OUTPUT_DIR (por defecto ./output)."""
    return RutasAlmacenamiento(base=Path(_env("OUTPUT_DIR", "./output")))
