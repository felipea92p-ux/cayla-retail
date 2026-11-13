## 📈 Productos: las ventas de 30 días de una vez (2026-11-13, ADR-0656 act. d) — rama `claude/facetas-demanda-estable`

- [x] `20261113225000`: `demanda` de `fn_productos_facetas` con las ventas de 30 días primero (`materialized`). Mismo JSON, 54 mil bloques en seis bases nuevas (antes 55 mil o 112 mil, según la base).
- [x] `pnpm pruebas:productos-facetas-demanda` en `PRUEBAS`, con control y mutación.
- [x] **`20261113225000` pegada en producción** el 2026-11-13 (respondió «QUEDÓ BIEN»; md5 de `fn_productos_facetas` verificado por lectura: `745b6016…`, el mismo de la base local).
- [x] `fn_productos_facetas@lider` aceptado desde la corrida 43523159516 del CI de este PR: 112.046 → 53.965 (las otras 19, como estaban: sus diferencias eran ruido de 0,2 a 3 %).
- [ ] Que la corrida siguiente del CI lo repita.
- [x] Producción leída (solo lectura, 2026-11-13): `fn_productos_facetas` tiene la misma huella que la base local antes de la migración (`986a1b8c…`), el ancla está una vez; 4.064 variantes y 2.107 ventas en 30 días.
- [ ] Ver con un `explain` de solo lectura si producción cae HOY en el camino caro (no se midió: el `explain` de la función entera no se puede pedir desde afuera).
