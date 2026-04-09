"""
PDF representativo del comprobante (no sustituye al XML legal ni al CDR).
Útil para impresión en cocina/caja o envío al cliente.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import VentaInput
from .ubl_generator import calcular_totales_venta, formato_monto

logger = logging.getLogger(__name__)


def generar_pdf_comprobante(venta: VentaInput, ruta_salida: Path) -> Path:
    """
    Genera un PDF simple con datos del emisor, cliente, líneas y totales.
    """
    ruta_salida = Path(ruta_salida)
    ruta_salida.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(ruta_salida),
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    story = []

    titulo = "FACTURA ELECTRÓNICA" if venta.tipo.value == "01" else "BOLETA DE VENTA ELECTRÓNICA"
    story.append(Paragraph(f"<b>{titulo}</b>", styles["Title"]))
    story.append(Spacer(1, 0.5 * cm))

    e = venta.emisor
    emisor_txt = f"""
    <b>{e.razon_social}</b><br/>
    RUC: {e.ruc}<br/>
    {e.direccion}<br/>
    {e.distrito} — {e.provincia} — {e.departamento}
    """
    story.append(Paragraph(emisor_txt, styles["Normal"]))
    story.append(Spacer(1, 0.4 * cm))

    story.append(Paragraph(f"<b>Comprobante:</b> {venta.numero_completo()}", styles["Normal"]))
    story.append(Paragraph(f"<b>Fecha:</b> {venta.fecha_emision} {venta.hora_emision}", styles["Normal"]))
    story.append(Paragraph(f"<b>Moneda:</b> {venta.moneda}", styles["Normal"]))
    story.append(Spacer(1, 0.3 * cm))

    c = venta.cliente
    story.append(Paragraph("<b>Cliente</b>", styles["Heading2"]))
    cli = f"{c.razon_social}<br/>Doc: ({c.tipo_doc}) {c.numero_doc}<br/>{c.direccion or ''}"
    story.append(Paragraph(cli, styles["Normal"]))
    story.append(Spacer(1, 0.4 * cm))

    data = [["Cant.", "Descripción", "P. unit.", "Total"]]
    for ln in venta.lineas:
        line_ext = (ln.cantidad * ln.precio_unitario_sin_igv).quantize(Decimal("0.01"))
        data.append(
            [
                formato_monto(ln.cantidad),
                ln.descripcion[:80],
                formato_monto(ln.precio_unitario_sin_igv),
                formato_monto(line_ext),
            ]
        )

    t = Table(data, colWidths=[2 * cm, 8 * cm, 3 * cm, 3 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
            ]
        )
    )
    story.append(t)
    story.append(Spacer(1, 0.5 * cm))

    op_gravadas, igv, total = calcular_totales_venta(venta)
    tot_txt = f"""
    <b>Op. gravadas:</b> {venta.moneda} {formato_monto(op_gravadas)}<br/>
    <b>IGV ({formato_monto(venta.porcentaje_igv)}%):</b> {venta.moneda} {formato_monto(igv)}<br/>
    <b>Total:</b> {venta.moneda} {formato_monto(total)}
    """
    story.append(Paragraph(tot_txt, styles["Normal"]))
    story.append(Spacer(1, 0.3 * cm))
    story.append(
        Paragraph(
            "<i>Representación impresa. Consulte validez en SUNAT con el XML y CDR.</i>",
            styles["Italic"],
        )
    )

    doc.build(story)
    logger.info("PDF generado: %s", ruta_salida)
    return ruta_salida
