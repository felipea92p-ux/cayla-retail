# ADR-0051 — Producción del Taller vuelve sobre V2: el Taller es un tipo de ubicación propio y la migración se reconstruyó desde la base local

**Fecha:** 2026-09-15
**Estado:** Aplicado en local y **en producción** (verificado contra la base el
2026-09-15 por la tarde: tablas, 5 RPC, check de `ubicaciones.tipo` y fila «Taller ·
taller» presentes). Pendiente solo `pnpm datos:generar:produccion`. (La migración
nació como `20260915120000` y se registró así en la base; se renombró a
`20260915130000` al fusionar con Movimientos porque esa versión ya estaba tomada en
producción por `reparar_fk_transferencia_items.sql` — mismo contenido, otro nombre de
archivo, ver el encabezado de la propia migración.)
**Afecta:** `supabase/migrations/20260915130000_produccion_del_taller.sql` (nueva),
`supabase/seed.sql` (Taller nace `taller`), `apps/web/lib/produccion.ts` + `produccion-reglas.ts`
(nuevos), `app/(app)/produccion/page.tsx`, `components/OrdenesProduccionV2.tsx` +
`NuevaOrdenProduccionForm.tsx` (nuevos), `lib/persona-actual.ts` y `lib/ubicaciones.ts`
(`ubicacionTipo` suma `"taller"`), `components/AppShell.tsx` (ítem Producción),
`vender/facturacion/page.tsx` (solo tiendas emiten), `packages/database/src/types.ts`.

## Contexto

El corte V1→V2 (`0af2f1b`, 2026-09-12) borró Producción a propósito: 13 archivos, entre
ellos 8 migraciones (`0018`…`0031`) y tres componentes (`OrdenesProduccion.tsx`,
`RecibirLoteForm.tsx`, `lib/taller.ts`). Felipe pidió restaurarla el 2026-09-15.

Al auditar el repo apareció algo que no estaba en ningún documento: el Postgres local ya
tenía aplicada una migración `20260915120000 produccion_del_taller` (renombrada a `20260915130000` el mismo día por un choque de timestamp con otra migración, ver el encabezado del archivo) —V2-nativa, con
`ubicacion_id`, `fn_aplicar_movimiento`, token de idempotencia, comentarios en el estilo
del repo— **pero el archivo `.sql` no existía en ningún branch, worktree, stash ni objeto
suelto de git**. Alguien (una sesión anterior de hoy) la escribió, la aplicó y el archivo
se perdió. La única copia era la base.

## Decisión

1. **Restaurar sobre V2, no resucitar V1.** V1 producía contra `sedes.unidad_id`,
   `stock` por sede y `precio_taller`; V2 tiene `ubicaciones`, `sububicaciones` y
   `movimientos` inmutables. Portar los 8 archivos de V1 habría revivido las dos
   generaciones del núcleo a la vez (lo que ADR-0075 descartó para el vocabulario).
2. **Reconstruir la migración desde la base local, no reescribirla de memoria.**
   `pg_dump --schema-only` de las dos tablas + `pg_get_functiondef` de las 5 RPC +
   `pg_policies` + grants → un archivo con cabecera nueva y cuerpo idéntico. Se verificó
   con `npx supabase db reset` (base solo desde archivos) y `diff` contra el dump previo:
   tablas y RPC **idénticas**. Lo único que el dump de tablas no mostró —y se detectó
   porque tras el reset la pantalla decía "no hay Taller"— fue el cambio al check de
   `ubicaciones.tipo`; se agregó y se volvió a resetear.
3. **El Taller es `ubicaciones.tipo = 'taller'`, no "un almacén más".** El check pasa a
   `('tienda','almacen','taller')` y la fila «Taller» (una sola, en producción y en el
   seed) se convierte en la migración. `abrir_produccion` solo acepta ubicaciones
   `taller`: el stock **nace** ahí, no llega por traslado. Consecuencias en la app:
   `ubicacionTipo` gana `"taller"`, el AppShell muestra Producción al líder y a quien
   trabaja en el Taller, y Facturación filtra `tipo === "tienda"` (antes `!== "almacen"`,
   que habría dejado al Taller emitir comprobantes).
4. **Reglas puras separadas de la lectura.** `lib/produccion-reglas.ts` (etapas,
   semáforo de margen, costo unitario; 8 tests) no importa Supabase ni `next/headers`,
   así que los componentes cliente lo usan sin arrastrar el servidor al bundle —
   exactamente el error 500 que dio el primer intento.
5. **Las variantes nacen en Productos, nunca desde una orden** (decidido con Felipe el
   mismo día, al comparar con V1). V1 dejaba tipear "S, M, L" y "Negro, Palo Rosa" en la
   orden y `registrar_produccion` creaba las variantes al vuelo: prendas sin precio (hoy
   ADR-0048 lo prohíbe), colores duplicados ("Negro"/"negro") y SKUs a ciegas. V2 conserva
   la firma de `abrir_produccion` (solo `variante_id` existentes) y la pantalla lo hace
   visible: matriz color × talla al estilo Shopify donde **solo hay celda si el catálogo
   tiene esa variante**; una combinación que falta se ve como «—» y un enlace manda a
   Productos. Se descartó la alternativa B (crear al vuelo) por el principio 2.

## Lo que la base vuelve imposible

- Cerrar dos veces la misma orden (`inventariado_at` + estado).
- Una orden `terminada` sin `cantidad_buenas`, o `en_proceso` con `inventariado_at`
  (`producciones_terminada_coherente`).
- Sumar stock a una talla de otro modelo (`abrir_produccion` valida
  `variantes.producto_id`).
- Abrir la misma orden dos veces por un reintento (`token_cliente` unique).
- Escribir `producciones`/`produccion_lineas` desde la pantalla (sin policy de
  insert/update/delete: solo RPC).
- Borrar la entrada de stock al revertir: se registra una `salida` con motivo
  `reversion_produccion` (principio 4).

## Verificado

Ciclo completo por PostgREST con el JWT de Felipe: abrir (10+5) → mismo token devuelve
la misma orden → etapa → tienda intenta abrir y la base la rechaza → cerrar (9+5, tela
real) → stock 20→34, 2 movimientos `produccion`, `variantes.costo` = 26.07 → segundo
cierre rechazado → revertir → stock 34→20, 4 movimientos (nada borrado) → anular.
Micaela (integrante de tienda) lista `producciones` y recibe `[]`.

## Pendiente

- Refrescar el diccionario (`pnpm datos:generar:produccion`) para que `producciones` y
  `produccion_lineas` aparezcan en `docs/datos/generado/`.
- Movimientos pinta `produccion` / `reversion_produccion` como texto crudo; un enlace a la
  orden queda para después.
- Sin decidir: si la orden necesita un atajo «Nuevo modelo» que abra el flujo de Productos
  y vuelva con el modelo elegido (Productos V2 hoy no crea variantes desde pantalla — nacen
  por importación), y si «tercerizado» debe marcarse al abrir la orden o basta en la
  tarjeta, como hoy. `productos.material` (V1) no existe en el esquema V2: no se agrega
  desde Producción (principio 1).
- `recibir_lote` sigue existiendo para mercadería sin factura; V1 tenía `RecibirLoteForm`
  para el Taller y V2 lo cubre con Compras → Recibir. No se restauró: decidir con Felipe
  si el Taller necesita una entrada manual aparte de la corrida.
