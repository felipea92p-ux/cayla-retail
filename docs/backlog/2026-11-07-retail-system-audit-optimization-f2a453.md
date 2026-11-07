# Rendimiento de la base (ADR-0622) — pendientes

## No está en producción
- [ ] Pegar, con el OK de Felipe y en hora tranquila, en este orden:
  - [ ] `20261107164000`: índices y `fn_metas_de_los_dias`.
  - [ ] `20261107171000`, PARTE 1 (funciones); su PARTE 2 (índice sobre `movimientos`) va aparte.
  - [ ] `20261107172000`.
  - [ ] `20261107202000`.
  - Si salta el candado md5 de una función, esa función se reescribe desde su `pg_get_functiondef` real.
- [ ] Después de pegar: `pnpm datos:generar:produccion` (incluye la función nueva `fn_proveedor_reparto_de`) y `pnpm datos:comparar`.
- [ ] Correr `scripts/rendimiento/diagnostico-produccion.sql` antes y después de pegar, y anotar las cifras aquí.

## Decisiones de Felipe
- [ ] Vender pide «dónde más hay» por prenda en vez de todo el stock de la red (`fn_stock_por_sede_json`: 18 MB y 144 mil filas con un año). Toca
  Vender, Cambios, Apartados y Existencias. Viene de ADR-0194 #7.
- [ ] Inventario ▸ Resumen (`fn_resumen_variantes_json`, 1,9 s): calcular solo la sede pedida, o precalcular. Viene de ADR-0194 #8.
- [ ] Compras ▸ Proveedores (~2,2 s): una sola RPC para la página, o una tabla derivada con minutos de atraso.
- [ ] Tamaño del cómputo de Supabase: decidir con los números del diagnóstico de producción. Viene de ADR-0194 #9.

## Siguientes optimizaciones (sin decisión de negocio)
- [ ] El marco: juntar en una sola RPC las 6 de la persona.
- [ ] Sacar los contadores del menú a un `Suspense`.
- [ ] N+1 por sede en analítica: `motor-demanda`, `decision-produccion`, `analisis-sede`, `rendimiento`, `por-regularizar-stock`.
- [ ] Finanzas: `estados-serie` pide 13 meses en tandas de 4 en serie (una RPC con varios rangos).
- [ ] Movimientos: `getResumenTienda` se pide 2 o 3 veces por carga.
- [ ] Por regularizar: 4 tramos en serie.
- [ ] Recibir: `getConteosDelEnvio` se pide por cada envío abierto.
- [ ] `getUser()` → `getClaims()` en `app/api/lucode/*` y `app/api/padron`.
- [ ] Datos que se repiten entre usuarios (colores, categorías, tallas, banderas `fn_acepta_*`): caché compartida con etiqueta que se invalida al
  guardar.
- [ ] Medir en producción si quitar `security definer`/`search_path` de `fn_item_es_de_claure`, `fn_dueno_de_la_linea` y `fn_cuenta_de_cobro` ahorra
  lo que midió `20261101004000`.
- [ ] Probar en el navegador, con sesión: Inicio, Vender (también a 375 px), Caja y Comercial. Solo cambió el orden de las lecturas.
