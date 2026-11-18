## Tienda: abaratar `retail.tienda_probador` (2026-11-07)

Medido en producción: 1 252 ms en reposo (media de `pg_stat_statements` 1 786 ms, máx. 4 945 ms, a un paso del corte de 5 s). La avalancha ya
no se repite (`lib/una-a-la-vez.ts`, cabecera de 10 min), pero la función crece con cada prenda. Necesita migración: mostrársela a Felipe antes.

- [ ] **Armar el JSON una vez por prenda** (~790 ms): el CTE `recortes` se usa una vez y Postgres lo recalcula, con su regex, dentro de la
      subconsulta correlacionada de cada una de las ~227 prendas. `materialized` + agrupar recortes, colores y stock por `producto_id` y unir.
- [ ] **Elegir las prendas sin regex** (~335 ms): guardar el nombre del archivo en `producto_fotos` (columna generada desde `url`) con
      índice y unirlo a `foto_recortes.foto` (su clave primaria).
- [ ] Opcional: `retail.tienda_hay_probador(sede) returns boolean` para la cabecera, si aun con 10 min de caché pesa.
- Cómo se verifica: `explain analyze select retail.tienda_probador(null)` bajo 300 ms; en `pg_stat_statements`, la media de la tienda bajo 500 ms.
