# ADR-0097 — Activar Tienda Lima en producción

## Contexto

Felipe pidió activar la tienda de Lima. Antes de tocar nada se auditó el estado
real: Tienda Lima **no estaba inactiva — no existía**. `retail.ubicaciones` en
producción (`vovjyyiafkxteijimpuy`) solo tenía Taller, Tienda AQP y Tienda TRU
(las 3 creadas el 2026-09-12, corte V1→V2). Las decenas de menciones de
"Tienda Lima" en `BITACORA.md` son todas de pruebas en el seed local
(`felipe@cayla.local`) o en el Postgres compartido de desarrollo — nunca se
había dado de alta en la base real.

Al armar la migración apareció una trampa de nomenclatura ya documentada en
`BACKLOG.md` (entrada 2026-09-10): en Dynamic (`public.sedes`, fuente real de
identidad), el código `LIM` es el **Taller**, y el código `003` es la
**tienda de Lima** — nombre real en Dynamic: "Tienda LIM". Confirmado con
Felipe antes de aplicar.

## Decisión

Se creó, vía `apply_migration` contra `vovjyyiafkxteijimpuy`
(`20260918010733_activar_tienda_lima.sql`, previamente verificada con un
dry-run + rollback contra la misma base):

- `retail.ubicaciones`: fila nueva `nombre='Tienda LIM'`, `tipo='tienda'`,
  `activo=true`, `sede_dynamic_id` enlazado a la fila de Dynamic con
  `codigo='003'` — mismo patrón que ya usan Tienda AQP y Tienda TRU (enlace a
  su sede Dynamic real), no el patrón del Taller (que no tiene enlace).
- `retail.sububicaciones`: las mismas 3 que ya tienen AQP/TRU — "Piso de
  venta" (`piso_venta`), "Almacén de tienda" (`almacen_tienda`) y
  "Cuarentena" (`cuarentena`).

Se descartó nombrarla "Tienda Lima" (como en el seed local) para no inventar
una segunda etiqueta para el mismo lugar — se usa el nombre que Dynamic ya le
da a esa sede.

## Consecuencias

- Verificado contra producción real después de aplicar: la fila existe,
  `activo=true`, `sede_dynamic_id` correcto, las 3 sububicaciones creadas.
  `get_advisors` (security) no muestra ninguna advertencia nueva asociada a
  este cambio (es un insert de datos, sin tabla/política/función nueva).
- Cualquier líder puede pararse en Tienda LIM desde el selector de ubicación
  de inmediato — `fn_puede_operar_ubicacion` ya la reconoce por ser una fila
  más de `retail.ubicaciones`, sin código nuevo.
- Sin stock ni colaboradores asignados todavía — la tienda queda operable
  pero vacía. Cargar mercadería (traslado desde Taller/almacén) y asignar una
  Encargada son pasos operativos posteriores, no parte de "activar".
- **Se rompe si** en el futuro alguien reasigna o renombra el código `003`
  en Dynamic — `sede_dynamic_id` quedaría apuntando a otra sede. Mismo riesgo
  ya existente para Tienda AQP y Tienda TRU; no se resolvió acá.
