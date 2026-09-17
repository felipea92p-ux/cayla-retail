# ADR-0031 — `recalcular_stock()` vuelve a saber que el almacén existe

**Fecha:** 2026-09-10
**Estado:** Aplicado y verificado en producción, incluida una corrección puntual de datos.

## Contexto

Al cerrar ADR-0032 (idempotencia de `registrar_venta`), se revisó el resto de
ítems abiertos de `docs/BACKLOG.md` para decidir el siguiente paso. Uno de
ellos —"`recalcular_stock` borra el `stock_minimo` de una variante sin
movimientos"— llevaba anotado desde `0044_almacen_interno.sql` como un
"borde heredado, no resuelto acá" de ADR-0020.

Al verificar el cuerpo REAL de `retail.recalcular_stock()` en producción
(no el de ningún archivo del repo) apareció algo más grave que el borde
anotado: la función vigente es la versión de ADR-0020 ("el neto en una
sola pasada"), escrita **antes** de que existiera el almacén interno — no
tiene ninguna referencia a `contenedores` ni a `stock_almacen`. Producción
ya tiene 4 contenedores tipo `'almacen'` reales (uno por sede) y 9
movimientos ya enrutados a ellos. Si alguien invoca esta función hoy —es la
"red de seguridad" manual que describe `ARQUITECTURA.md` §4.2, pensada para
correrse cuando se sospecha que el snapshot de `stock` se desincronizó—,
mezclaría esos 9 movimientos de vuelta al piso de venta, duplicando
mercadería que en realidad sigue en el almacén interno.

De paso se encontró que la función también **perdió el candado de
permiso**: la versión de ADR-0020 no tiene ningún chequeo de rol, y
`authenticated`/`PUBLIC` (por herencia, `anon`) tenían `EXECUTE`. La versión
original (anterior a ADR-0020, verificada en una sesión previa) sí exigía
`retail.es_lider()` — se perdió al reescribir la función para el fix del
neto, sin que nadie lo documentara como una decisión.

## Decisión

**DECIDÍ:** portar el diseño piso/almacén ya escrito y revisado en
`supabase/migrations/0044_almacen_interno.sql` (bloque 7 — existe en
`origin/main` pero nunca se pegó a producción con ese alcance), sumándole
tres cosas que esa migración dejó pendientes o que se perdieron después:
el candado de Líder, la excepción de `tipo='traslado'`, y el guard de
`stock_minimo is null`.

**Verificación antes de aplicar (adversarial):** un primer borrador —sin la
excepción de traslado— fue refutado: `fn_aplicar_movimiento` fuerza
`v_es_almacen := false` incondicionalmente para `tipo='traslado'`, sin
importar el `contenedor_id` — es el mecanismo real, aunque hoy inalcanzable
desde el frontend, de "devolver a almacén" (`MovimientoModal.tsx:75`,
`InventarioAgrupado.tsx:86-87` fuerza esa rama a `[]` a propósito). Sin la
misma excepción, un traslado hacia un contenedor de almacén se habría
restado del piso de origen sin sumarse en ningún lado — inventario que
desaparece, no que se duplica, pero un estado igual de imposible. **DECIDÍ**
agregar `m.tipo = 'traslado' or ...` en las dos subconsultas de piso antes
de aplicar, no después.

La misma revisión levantó una alarma sobre `retail.es_lider()` —que en
producción pregunta `fn_rol_actual() = 'admin'` contra `public.personas`
(Dynamic), no contra un campo propio de retail— sugiriendo que podía estar
verificando la identidad equivocada. **Se verificó directamente**: los 5
`admin` de Dynamic son exactamente los mismos 5 que `retail.personas`
mapea a `lider` (`lib/persona.ts:mapearRol`, `admin → lider` es una
equivalencia intencional de la unificación, no un descuido). **DESCARTÉ**
tratar esto como un hallazgo nuevo — es el patrón ya usado hoy por
`fijar_stock_minimo`, verificado correcto, y perseguirlo habría sido
resolver un problema que no existe a costa de no cerrar el que sí.

**DESCARTÉ** dejar el guard de `stock_minimo` para otra sesión "porque ya
estaba anotado así desde ADR-0020" — la función se estaba reescribiendo de
todos modos por el motivo del almacén; posponerlo no bajaba ningún riesgo
y sí dejaba dos arreglos relacionados en dos aplicaciones separadas a
producción.

## Hallazgo no buscado: 2 filas de stock ya estaban mal, hoy

Antes de aplicar, se comparó (por `select` de solo lectura, sin invocar la
función) lo que esta lógica calcularía contra el `stock` real de las 4
sedes. Coincidencia exacta en las 4 filas de `stock_almacen` y en 8 de 10
filas de `stock` (piso). Las 2 discrepancias correspondían a la misma
prenda-patrón: un `ingreso de lote` con `contenedor_id` de almacén, seguido
de `bajada a piso` (salida de almacén) + `bajada de almacén` (entrada a
piso) — y el `stock.cantidad` real resultó ser exactamente
`entrada_almacén − salida_almacén + entrada_piso − salida_venta`, es decir,
la entrada al almacén se había contado también como piso. Esto solo pudo
pasar con una versión de `fn_aplicar_movimiento` anterior a que supiera
separar almacén de piso — el registro es de 2026-09-05, la misma fecha en
que se construyó el almacén interno.

**DECIDÍ**, con confirmación explícita de Felipe, corregir esas 2 filas con
un `update` puntual (99→49 y 98→58, ambas en la sede de Arequipa) en el
mismo script, en vez de esperar a que alguien invoque `recalcular_stock()`
manualmente — el número mostrado en Catálogo/Vender ya estaba inflado en 50
y 40 unidades respectivamente, con la venta operando sobre esos datos hoy.
**DESCARTÉ** correr la función completa para producir la misma corrección:
exige impersonar la sesión de un Líder real, y un `update` de dos filas
puntuales, ya verificado dato por dato, es más auditable que invocar una
función nueva sin poder ver su resultado en el mismo paso.

## Alternativas descartadas

- **Dejar `recalcular_stock()` como está y solo arreglar `stock_minimo`.**
  Se descartó: habría cerrado el hallazgo menor dejando vivo el mayor (la
  ceguera al almacén), que es un riesgo real con datos reales hoy en
  producción, no una posibilidad remota.
- **Revocar `EXECUTE` de todos en vez de arreglar la función**, para
  "neutralizarla" hasta decidir con calma. Se descartó: es la única red de
  seguridad que existe para el snapshot de stock; dejarla inutilizable no es
  más seguro que dejarla rota, solo cambia el tipo de riesgo.

## Consecuencias

Verificado después de aplicar, con consulta directa (no solo la
autocomprobación del script): `recalcular_stock()` menciona `stock_almacen`
y `es_lider` en su cuerpo, el índice/guard de `stock_minimo` está presente,
`anon` sin `EXECUTE`, `authenticated` con `EXECUTE`. Las 2 filas corregidas
verificadas en 49 y 58 respectivamente.

**Pendiente, no de este cambio:** los traslados en dos fases (`0040` de la
rama `claude/inventory-system-optimization-005f1e`, sin fusionar) y la
sugerencia de traslado de un clic dependen de una versión de
`fn_aplicar_movimiento`/`recalcular_stock` que todavía no conoce esa
tabla — portarlos exige revisar de nuevo esta misma función, no un
cherry-pick directo.
