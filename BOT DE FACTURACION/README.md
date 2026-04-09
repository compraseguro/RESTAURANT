# Facturación electrónica Perú (SUNAT) — módulo para app de restaurante

Sistema **modular en Python** para generar **XML UBL 2.1** (factura `01` / boleta `03`), **firmar** con certificado **.pfx**, **enviar** a **SUNAT** vía **SOAP** (`sendBill`), **guardar el CDR**, y emitir un **PDF** representativo.

> **Aviso:** SUNAT exige XML que cumpla XSD, RUC/serie/correlativo autorizados y certificado válido. Use **beta** para pruebas. Valide siempre con el **validador oficial** y el **Manual del Programador** antes de producción.

## Estructura de carpetas

```
BOT DE FACTURACION/
├── main.py                 # Flujo CLI (entrada → XML → firma → envío → PDF)
├── requirements.txt
├── .env.example
├── README.md
├── data/
│   └── ejemplo_venta.json  # Datos de prueba (JSON)
├── examples/
│   └── ejemplo_uso_api.py  # Ejemplo de integración en código
├── certs/                  # (opcional) coloque aquí su .pfx — no subir a git
└── restaurant_efact/
    ├── __init__.py
    ├── config.py             # Credenciales, URLs beta/producción, rutas
    ├── models.py             # Dataclasses de venta / cliente / líneas
    ├── ubl_generator.py      # XML UBL 2.1
    ├── signer.py             # Firma XMLDSig (signxml + cryptography)
    ├── sunat_client.py       # SOAP sendBill + ZIP + CDR
    └── pdf_generator.py      # PDF con reportlab
```

Al ejecutar, se crea bajo `OUTPUT_DIR` (por defecto `./output`):

```
output/
├── xml/          # XML sin firmar
├── signed/       # XML firmado
├── cdr/          # ZIP y XML de constancia (CDR) devueltos por SUNAT
└── pdf/          # PDF representativo
```

## Requisitos

- **Python 3.10+**
- Certificado **.pfx** del contribuyente y usuario **SOL** con permisos de facturación.
- Paquetes: `pip install -r requirements.txt`

## Configuración

1. Copie `.env.example` a `.env`.
2. Complete `SUNAT_RUC`, `SUNAT_USUARIO_SOL`, `SUNAT_CLAVE_SOL`, `CERT_PFX_PATH`, `CERT_PFX_PASSWORD`.
3. En **pruebas**, use `SUNAT_AMBIENTE=beta` (endpoint oficial de pruebas SUNAT).

Usuario SOAP = **RUC + usuario SOL** (concatenado); el campo `SUNAT_USUARIO_SOL` es solo la parte del usuario (p. ej. `MODDATOS` en demos SUNAT).

## Cómo ejecutar

Desde la carpeta del proyecto:

```bash
# Solo XML + PDF con datos demo (sin firma si no hay PFX / contraseña)
python main.py --no-sign

# XML firmado + PDF; sin enviar a SUNAT
python main.py --dry-run

# Flujo completo (firma + envío SUNAT) — requiere .env y certificado válidos
python main.py

# Usar JSON de ejemplo
python main.py --no-sign --data data/ejemplo_venta.json
```

Ejemplo programático:

```bash
python examples/ejemplo_uso_api.py
```

## Flujo interno

1. Recibir datos de venta (`VentaInput` o JSON).
2. Generar XML UBL (`ubl_generator.py`).
3. Firmar XML (`signer.py`).
4. Comprimir en ZIP con nombre `{RUC}-{TIPO}-{SERIE}-{CORRELATIVO}.xml`.
5. Enviar a SUNAT (`sunat_client.py`) y procesar respuesta / **CDR**.
6. Generar PDF (`pdf_generator.py`).
7. Guardar archivos en `output/xml`, `output/signed`, `output/cdr`, `output/pdf`.

## Errores y logging

- **Red / timeout:** `sunat_client` captura `requests.RequestException`.
- **SOAP Fault:** se registra el `faultstring` y fragmento de respuesta.
- **Rechazo de comprobante:** SUNAT puede devolver estructura con código/mensaje; revise el XML del CDR y el validador SUNAT.

Nivel de log por defecto: `INFO` (ver `main.py`).

## Integración en su app de restaurante

- Construya `VentaInput` desde su pedido (mesa, delivery, etc.).
- Use el mismo flujo que `main.py` → `procesar_venta` o llame módulo por módulo como en `examples/ejemplo_uso_api.py`.
- Mantenga **correlativo** y **serie** alineados con su sistema de numeración y autorización SUNAT.

## Datos de prueba

- `data/ejemplo_venta.json`: factura de ejemplo (RUC y datos ficticios).
- `main.py` incluye `venta_demo()` con boleta demo.

Sustituya RUC, ubigeo, serie y correlativos por datos reales de su establecimiento.

## Firma y validación SUNAT

La firma usa **RSA-SHA256** y C14N **exclusive** (`signer.py`). Si el validador SUNAT exige la firma **solo** dentro de `UBLExtensions/ExtensionContent`, ajuste según el manual o use **xmlsec** con la plantilla oficial; el código indica este punto en comentarios.

## Referencias

- [Manual del Programador SUNAT — Facturación Electrónica](https://www.sunat.gob.pe/)
- [Greenter / documentación servicios web](https://fe-primer.greenter.dev/docs/webservices/) (referencia comunitaria sobre `sendBill` y nombres de archivo)
