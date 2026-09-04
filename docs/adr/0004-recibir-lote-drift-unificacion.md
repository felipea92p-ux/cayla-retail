# ADR-0004 — `recibir_lote` en producción divergió de la 0018 durante la unificación

**Fecha:** 2026-09-03
**Estado:** Migración escrita (`0031`), pendiente de correr en Supabase (producción)

## Contexto

Verificando `retail.recibir_lote` en producción (`pg_get_functiondef`, comparado
contra el frontend `RecibirLoteForm.tsx` y contra `supabase/migrations/*.sql`) se
encontraron tres diferencias reales entre lo que el sistema promete y lo que la
función realmente hace:

1. **No valida sede.** A diferencia de `retail.registrar_movimiento`
   (`07_funciones_operacion.sql:65`, sí llama a `retail.puede_operar_sede`),
   `retail.recibir_lote` no lo hace en ningún punto del cuerpo — cualquier
   autenticado podría recibir mercadería en la sede de otra tienda. Exactamente
   el hueco que la migración local `0012_rpc_valida_sede.sql` se escribió para
   cerrar (jul-2026); la reescritura de la unificación lo reabrió sin que
   quedara documentado.
2. **No guarda `categoria_id`.** El formulario (`RecibirLoteForm.tsx:226`) sí
   manda la categoría de cada prenda nueva; la función en producción nunca la
   lee ni la incluye en el `insert into productos`. Cada producto nuevo creado
   por "Recibir mercadería" queda con categoría `NULL`, sin importar qué elija
   la Encargada en pantalla.
3. **No acepta `p_orden_compra_id`.** El frontend lo manda cuando el origen es
   proveedor con una orden seleccionada; la función real no tiene ese
   parámetro, así que Postgres rechaza la llamada. "Recibir ligado a una orden
   de compra" está roto en producción hoy.

Las tres cosas SÍ estaban resueltas en local, en `supabase/migrations/
0018_produccion.sql` — la última vez que `recibir_lote` se redefinió antes de
la unificación. El script que la migró al schema `retail`
(`supabase/unificacion/08_funciones_finanzas.sql`) copió una versión más vieja
de la función, de antes de la 0017/0018 — el mismo tipo de error que Dynamic
ya aprendió a prevenir con `donde-vive.sh` (nunca copiar el cuerpo de una
función sin verificar cuál es la última versión). Nadie lo notó en julio
porque el catálogo real todavía no se había cargado: ningún producto nuevo se
creó de verdad por ese camino hasta ahora.

## Decisión

Restaurar `retail.recibir_lote` en producción a la lógica de la 0018 (validar
sede, guardar `categoria_id`, aceptar `p_orden_compra_id`), adaptada al schema
`retail` — ver `supabase/migrations/0031_recibir_lote_completo.sql` para la
versión local (idéntica a 0018, documentada por la brecha) y el cuerpo
schema-calificado que se pega en producción.

**NO se incluye `p_orden_produccion_id`.** El frontend lo manda
(`RecibirLoteForm.tsx:218`), pero apunta a un modelo de Producción
(`retail.ordenes_produccion`) que las migraciones `0025`-`0029` reemplazaron
por `retail.producciones` — y ese reemplazo nunca se propagó: ni `retail.lotes`
tiene columna para el vínculo, ni la pantalla de recibir
(`inventario/recibir/page.tsx:52,57`) se actualizó (todavía consulta
`ordenes_produccion` y una columna `lotes.orden_produccion_id` que no existe).
Confirmado con Felipe (2026-09-03): esto queda como tarea aparte, no se
mezcla con esta corrección.

## Alternativas descartadas

- **Arreglar las 3 cosas y además reconciliar producción en la misma sesión.**
  Se evaluó y se descartó con Felipe: la reconciliación de Producción necesita
  decidir si `producciones` reemplaza del todo a `ordenes_produccion`, qué
  significa "en camino, sin recibir" en el modelo nuevo, y una columna nueva en
  `lotes` — trabajo propio, no una corrección de función. Mezclarlo habría
  hecho más grande y más riesgosa una migración que hoy es simple y verificada.
- **Copiar el cuerpo de producción tal cual y solo agregarle la validación de
  sede.** Habría dejado `categoria_id` perdiéndose y `p_orden_compra_id` roto
  — dos problemas conocidos, sin arreglar, justo cuando arranca la captura
  real del catálogo (que depende de que `categoria_id` sí se guarde).

## Consecuencias

`retail.recibir_lote` vuelve a cumplir lo que promete: sede validada, categoría
guardada, orden de compra cerrada al recibir. El catálogo real (Frente 1) se
puede capturar con confianza de que la taxonomía de `0030` realmente queda
escrita en cada producto. Queda pendiente, como tarea propia, reconciliar
"recibir ligado a una producción del Taller" con el modelo `producciones`.
