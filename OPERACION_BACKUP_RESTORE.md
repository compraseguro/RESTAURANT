# Operación: Backup y Restore

## Objetivo

Reducir riesgo operativo ante fallos, corrupción o borrado accidental del archivo `restaurant.db`.

## Frecuencia recomendada

- Backup full cada 6 horas.
- Retención mínima: 14 días.
- Copia externa (otro disco o nube privada) diaria.

## Backup manual rápido (Windows PowerShell)

```powershell
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item ".\restaurant.db" ".\backups\restaurant_$ts.db"
```

## Restore manual rápido

1. Detener servidor.
2. Respaldar DB actual por seguridad.
3. Reemplazar `restaurant.db` con el backup elegido.
4. Iniciar servidor y ejecutar `npm run smoke`.

## Verificación post-restore

- Login admin/cajero correcto.
- Consulta de ventas diaria responde.
- Apertura de caja operativa.
- Integridad de productos/categorías visible en panel.
