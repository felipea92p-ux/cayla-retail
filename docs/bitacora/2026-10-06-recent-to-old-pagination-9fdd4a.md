## 2026-10-06 — Ventas sin registrar: de la más reciente a la más antigua, en páginas

- **Qué:** la lista de Existencias ▸ Ventas sin registrar ordena todas las filas por fecha de venta descendente y se pinta de 25 en 25 (`PaginacionLocal`).
- **Por qué así:** el orden se aplica en pantalla (`masRecientesPrimero`), no en `getPorRegularizar`, que sigue leyendo las pendientes de la más vieja a la más nueva para paginar la base sin saltarse filas. Las cuatro cifras de arriba siguen contando todas las filas, no solo la página visible.
- **Verificado en local (2026-10-06):** base local al día con las 88 migraciones pendientes (respaldo previo); 34 ventas de ejemplo (ya borradas): 25 por página, orden por Cobrado, buscador y combo de responsable funcionan. Pendiente: pegar la migración en producción con OK de Felipe, después de publicar la web.

## 2026-10-06 (b) — Ventas sin registrar: buscador, columnas que ordenan y «Responsable» al regularizar

- **Qué:** buscador local sobre la lista (por inicio de palabra, sin tildes), flechas en los encabezados Prenda, Vendió, Cobrado y Estado (un clic de mayor a menor, otro invierte), y la hoja «Regularizar» vuelve a pedir «Responsable». La pieza de columnas que ordenan quedó en `Encabezado` de `components/ui/Tabla.tsx`, para que otras tablas la usen.
- **Por qué así:** regularizar era una acción soltada del combo (2026-09-29) y en la terminal de la tienda el movimiento quedaba sin nombre; ahora la colaboradora de turno firma ella. Mismo camino que Editar producto (ADR-0354). Migración `20261006200000` saca la clave de `acciones_sin_responsable`: se pega DESPUÉS de publicar la web.
- **Verificado en local (2026-10-06):** base local al día con las 88 migraciones pendientes (respaldo previo); 34 ventas de ejemplo (ya borradas): 25 por página, orden por Cobrado, buscador y combo de responsable funcionan. Pendiente: pegar la migración en producción con OK de Felipe, después de publicar la web.
