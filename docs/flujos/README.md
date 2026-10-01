# Flujos de negocio — los guiones de `/flujo-de-negocio`

Cada archivo de esta carpeta es un **caso**: una situación real de CAYLA escrita como pasos, con lo que la base debe quedar
al terminar. La skill `/flujo-de-negocio` los corre contra el ERP local y los convierte en veredicto, reporte de fricción y
guía para colaboradores nuevos. Los casos son lo único de este sistema que va al repo; los informes, capturas y guías que
salen de correrlos viven en `.flujo-de-negocio/` (fuera de git, porque el repo es público).

## Los flujos

| Flujo | Carpeta | Quién opera | Casos |
|---|---|---|---|
| Venta completa | `venta/` | colaboradora · clienta | `boleta-sin-dni-yape` (aprobado 2026-09-30; corre con cuenta Admin: el turno es de Dynamic y queda fuera) |
| Cambio y devolución | `cambios-devoluciones/` | colaboradora · líder · clienta | ninguno todavía |
| Traslado entre sedes | `traslados/` | colaboradora · líder | ninguno todavía |
| Caja: abrir y cerrar | `caja/` | colaboradora · líder | ninguno todavía |
| Inventario: revisar, reponer, ajustar | `inventario/` | colaboradora · líder | ninguno todavía |

**Para agregar un flujo:** una carpeta nueva, una fila en esta tabla y sus casos con la plantilla. La skill no cambia: lee
esta tabla para saber qué existe. Orden de trabajo acordado con Felipe (2026-09-30): primero **Venta completa**, y su forma
es la que copian los demás.

## Qué es un caso

Se escribe en palabras del negocio, no del sistema. Sigue `_plantilla-caso.md`. Tres reglas:

1. **El «Objetivo» es lo único que ve la pasada ciega.** Si describe botones o pantallas, la medición de fricción no sirve:
   una colaboradora del primer día recibe «vende esto a esta clienta», no «entra a Vender y pulsa Cobrar».
2. **Cada paso tiene sus tres columnas**: qué se ve, qué se hace, qué sigue. Es también el esqueleto de la guía.
3. **Cada regla que se prueba cita su origen** (`R-nn` de `docs/datos/15-COMO-OPERA-CAYLA.md`, `D-nn` de
   `docs/datos/DECISIONES-*.md`). Si no hay regla escrita, el caso dice «sin regla escrita»: no se inventa una.

## Cuentas de prueba

Las del seed local (`supabase/seed.sql`): `felipe` y `sandra` son líderes, `micaela` es colaboradora fija a una sede. Un
caso que cruza roles (la colaboradora registra, la líder aprueba) usa dos cuentas; **quien registra no puede aprobar**.
