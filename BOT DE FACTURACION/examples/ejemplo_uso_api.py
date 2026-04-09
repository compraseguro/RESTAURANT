# -*- coding: utf-8 -*-
"""
Ejemplo de uso programático (integración en su app de restaurante).

Ejecutar desde la raíz del proyecto:
  python examples/ejemplo_uso_api.py
"""

from __future__ import annotations

import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from restaurant_efact.config import CertificadoConfig, RutasAlmacenamiento, SunatConfig
from restaurant_efact.models import (
    ClienteInput,
    EmisorConfig,
    LineaVenta,
    TipoComprobante,
    VentaInput,
)
from restaurant_efact.pdf_generator import generar_pdf_comprobante
from restaurant_efact.signer import firmar_xml_ubl
from restaurant_efact.sunat_client import empaquetar_xml_en_zip, enviar_comprobante
from restaurant_efact.ubl_generator import generar_xml_ubl


def ejemplo_generar_solo_xml_y_pdf() -> None:
    """No requiere PFX ni SUNAT: útil para probar UBL y PDF."""
    rutas = RutasAlmacenamiento(base=ROOT / "output")
    rutas.ensure_all()

    venta = VentaInput(
        tipo=TipoComprobante.BOLETA,
        serie="B001",
        correlativo=99,
        fecha_emision=date.today().isoformat(),
        hora_emision=datetime.now().strftime("%H:%M:%S"),
        moneda="PEN",
        emisor=EmisorConfig(
            ruc="20123456789",
            razon_social="REST DEMO SAC",
            nombre_comercial="Rest Demo",
            ubigeo="150101",
            direccion="Av. Demo 1",
            provincia="LIMA",
            departamento="LIMA",
            distrito="LIMA",
        ),
        cliente=ClienteInput(
            tipo_doc="1",
            numero_doc="44556677",
            razon_social="CONSUMIDOR FINAL",
            direccion="",
        ),
        lineas=[
            LineaVenta("Plato del día", Decimal("1"), Decimal("18.00")),
        ],
    )

    xml_bytes, nombre = generar_xml_ubl(venta)
    (rutas.xml_sin_firma / f"{nombre}.xml").write_bytes(xml_bytes)
    generar_pdf_comprobante(venta, rutas.pdf / f"{nombre}.pdf")
    print("OK:", rutas.xml_sin_firma / f"{nombre}.xml")
    print("OK:", rutas.pdf / f"{nombre}.pdf")


def ejemplo_firma_y_envio(sunat: SunatConfig, cert: CertificadoConfig) -> None:
    """Requiere PFX válido y credenciales SOL; envía a SUNAT (beta o producción)."""
    rutas = RutasAlmacenamiento(base=ROOT / "output")
    rutas.ensure_all()
    venta = VentaInput(
        tipo=TipoComprobante.FACTURA,
        serie="F001",
        correlativo=1,
        fecha_emision=date.today().isoformat(),
        hora_emision=datetime.now().strftime("%H:%M:%S"),
        moneda="PEN",
        emisor=EmisorConfig(
            ruc=sunat.ruc,
            razon_social="SU RAZON SOCIAL",
            nombre_comercial="Su Marca",
            ubigeo="150101",
            direccion="Su dirección fiscal",
            provincia="LIMA",
            departamento="LIMA",
            distrito="LIMA",
        ),
        cliente=ClienteInput(
            tipo_doc="6",
            numero_doc="20987654321",
            razon_social="CLIENTE SAC",
            direccion="Jr. Cliente 1",
        ),
        lineas=[LineaVenta("Producto 1", Decimal("1"), Decimal("100.00"))],
    )
    xml_bytes, nombre = generar_xml_ubl(venta)
    signed = firmar_xml_ubl(xml_bytes, cert)
    zip_b = empaquetar_xml_en_zip(signed, f"{nombre}.xml")
    res = enviar_comprobante(zip_b, f"{nombre}.zip", sunat)
    print("Envío OK:", res.ok, "Msg:", res.mensaje)


if __name__ == "__main__":
    ejemplo_generar_solo_xml_y_pdf()
    print("(Opcional) Configure SunatConfig y CertificadoConfig para llamar a ejemplo_firma_y_envio.")
