# Plan del piso, primera entrega (ADR-0350) — rama `claude/category-mix-development-141175`

Las 4 actividades aprobadas por Felipe el 2026-10-05, en orden. Cada una es un corte vertical con su commit.

- [x] 1. Grupos del mix y su rol: `grupos_mix` y `categoria_grupo_mix`, `fijar_grupos_de_categorias` (todo o nada, solo el líder), módulo `plan_piso` y pestaña «Grupos». SQL `20261006100000` **no está en producción**.
- [x] 2. Propuesta frente al piso real, solo lectura: `lib/mix-piso.ts` (peso en prendas confirmadas, rango de Wilson, reparto por resto mayor) y pestaña «Propuesta». Sin SQL nuevo.
- [x] 3. Foto semanal del riel por categoría: `espacio_piso`, `fn_registrar_espacio_piso`, cron `/api/inventario/espacio-piso`, pestaña «Historia». SQL `20261006110000` **no está en producción**.
- [x] 4. Cierre: ADR-0350, mapa de rutas (`docs/ARQUITECTURA.md`), bitácora y este backlog.

## Para Felipe (acciones que no son código)
- [ ] Pegar en producción `20261006100000` y después `20261006110000`, cada una sola, ANTES de publicar la web (verificación en el encabezado de cada una).
- [ ] Darle el módulo «Plan del piso» a quien corresponda en Roles y accesos (nace solo para el líder).
- [ ] Confirmar las 42 categorías en la pestaña Grupos (hoy salen «por revisar»: es mi propuesta, no tu decisión).
- [ ] Decidir si la foto del espacio pasa de semanal a **diaria** (una línea en `apps/web/vercel.json`; mide mejor el espacio promedio de la semana). Recomendado: diaria.
- [ ] Contar AQP y los metros de riel de TRU (los 1.800 de AQP son provisionales).
- [ ] Verificar la propuesta de TRU contra tu conteo físico cuando la sede cuadre su piso.

## Pendientes de código (entrega siguiente)
- [ ] Guardar y aprobar el mix con motivo e historial; ajuste del encargado con motivo.
- [ ] El tope de ±3 puntos al mes **con zona muerta de un error estándar** (el tope solo es del tamaño del ruido de un mes de ventas).
- [ ] La cobertura de Little como control, y «entra una, sale una». Antes, reconciliar la cobertura de TRU (≈ 3,5 semanas contra «7 a 9» del ADR-0329).
- [ ] La prueba de 4 semanas de Jeans, el mínimo por talla en el motor y la reserva de prueba por rol.
- [ ] La meta del mix por categoría que espera el motor del piso (`OpcionesPlan.mix`, por `categoriaId`): repartir la meta de cada grupo entre sus categorías.

## Dependencias y deudas conocidas
- El peso de la venta propia solo cuenta ventas confirmadas: con ≈ 7 de cada 10 «sin registrar» en TRU, la propuesta es casi pura industria hasta que se regularicen (PR #788, parte 2, sin pegar).
- Refrescar el diccionario de datos (`pnpm datos:generar:produccion`) cuando las dos migraciones estén en producción; mientras tanto `pnpm datos:comparar` dirá 28 llamadas «sin respaldo» (las 23 de antes más las 5 funciones nuevas de esta rama: `fn_grupos_mix`, `fn_categorias_grupo_mix`, `fijar_grupos_de_categorias`, `fn_espacio_piso` y `fn_registrar_espacio_piso`). Termina con código 1 a propósito y reescribe `DRIFT.md`: no se commitea.
- `packages/database/src/types.ts` está desactualizado respecto de la base (8.835 líneas contra 15.319 al regenerarlo): las funciones nuevas se llaman con `as never`, como el resto de las recientes.
