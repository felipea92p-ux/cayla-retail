# ADR-0068 — El traslado entre ubicaciones pasa de atómico a dos fases

**Numeración:** nació como ADR-0064 en esta rama; al fusionar con `main` ese número ya lo
tenía "Cambio y devolución exigen caja" (0064-cambio-y-devolucion-exigen-caja-si-hay-
efectivo.md). Se renumera a 0068, siguiendo a ADR-0067 (misma rama, mismo motivo).

**Fecha:** 2026-09-16
**Estado:** Aplicado en local Y en producción (`20260916150000_traslados_dos_fases.sql`,
aplicada contra `cayla-dynamic` vía MCP de Supabase con autorización explícita de Felipe,
verificada contra `pg_proc`/`information_schema` en producción tras aplicar — incluida la
transferencia real que ya existía, que quedó intacta con `estado='completada'`).
**Afecta:** `retail.transferencias` (candado de `estado` ampliado, columnas nuevas),
tabla nueva `retail.transferencia_recepciones`, columna nueva `retail.movimientos.
transferencia_recepcion_id`, función `retail.transferir` retirada y reemplazada por
`iniciar_traslado`/`registrar_recepcion_traslado`/`confirmar_traslado`/
`cerrar_traslado_con_diferencia`/`fn_traslado_lineas`, y `retail.fn_movimientos`/
`fn_movimientos_resumen` (ADR-0050) — reconocen las dos piernas nuevas como categoría
"transferencia". **Ninguna tabla de catálogo/stock cambia de forma; `fn_aplicar_movimiento`
y `recalcular_stock()` no se tocan.**

## Contexto

Hoy un traslado (`transferir()`) es un paso atómico e instantáneo: una sola fila de
`movimientos` con `tipo='traslado'` resta en el origen y suma en el destino en la misma
transacción. Trujillo↔Arequipa son ~20 horas de bus — en ese tiempo el destino "ve" en
pantalla stock que en realidad todavía no puede vender. Un análisis sin fusionar de un
compañero (`origin/claude/erp-graph-analysis-3af87a`, 12-sep, nunca mergeado) ya había
comparado esto contra 16 sistemas de inventario y encontrado el mismo patrón: los que
modelan bien el viaje tratan el traslado como un documento con estados (enviado → en
tránsito → recibido), no como un paso instantáneo. Felipe, al elegir piezas inspiradas en
una comparación contra NetSuite, decidió construirlo.

## Decisión

1. **El envío deja de ser `tipo='traslado'` y pasa a ser un `tipo='salida'` común
   (`motivo='traslado_salida'`); la confirmación es un `tipo='entrada'` común
   (`motivo='traslado_entrada'`).** `tipo='traslado'` queda exclusivo de `mover_interno()`
   (piso↔almacén, misma sede, sigue instantáneo a propósito — es la misma sede, no hay
   viaje) y de las filas históricas `estado='completada'`. Consecuencia directa: **cero
   cambios en `fn_aplicar_movimiento` ni en `recalcular_stock()`** — las ramas
   `entrada`/`salida` ya hacían exactamente lo que cada fase necesita; el signo (`delta`)
   tampoco cambia.
2. **`transferencias` se extiende en su lugar, no se duplica.** El candado
   `check (estado in ('completada'))` se amplía a `('completada', 'en_transito',
   'recibido_con_diferencia', 'cerrada')`; se agregan `fecha_estimada_llegada`,
   `confirmado_por/en`, `cerrado_por/en`, `nota_cierre`. Una tabla nueva,
   `transferencia_recepciones`, guarda lo que REALMENTE llegó, línea por línea —
   deliberadamente SIN FK a `transferencia_items`: una sustitución (variante recibida que
   nunca se envió) no tiene fila de envío a la cual apuntar, y es justo el caso que Felipe
   pidió poder auditar.
3. **Decisiones de negocio de Felipe, no técnicas:**
   - Confirma **cualquier colaborador que opera la sede destino**, no hace falta líder.
   - Si lo recibido no coincide con lo enviado (cantidad distinta, o una variante que
     nunca se envió), el traslado queda **`recibido_con_diferencia`**, pendiente de que
     un **líder de destino** lo revise y cierre — espejo exacto de `cerrar_conteo`: se
     registran los hechos, el líder aprueba, y AL CERRAR se escriben los movimientos con
     motivo documentado, no antes. `confirmar_traslado` exige que TODA línea enviada
     tenga su contraparte registrada (aunque sea 0) antes de evaluar — una línea olvidada
     nunca se trata en silencio como "llegó 0 y está bien".
   - El tiempo estimado de llegada lo fija **quien envía, por traslado** — no un umbral
     fijo del sistema.
4. **La lectura (`fn_movimientos`) necesita saber que un traslado ahora son DOS filas, no
   una.** Sin este cambio, una pierna `tipo='salida'` con `motivo='traslado_salida'` caía
   en la categoría genérica "salida", mezclada con ventas. Se agregó una rama a la
   categorización y al filtro `p_categoria` (`transferencia` incluye ambos motivos nuevos;
   `entrada`/`salida` los excluyen explícitamente).

## Fuera de esta pieza, a propósito

**Guía de Remisión Electrónica (SUNAT).** El análisis sin fusionar que motivó esta pieza
también señala que mover mercadería entre establecimientos la exige desde 2023 — grep en
el repo: cero implementación. Es un hueco legal real, pero es una integración aparte (como
Nubefact), con su propia autorización explícita — el propio CLAUDE.md de este repo marca
"integraciones que muevan dinero real / cumplimiento legal" como "detente y confirma
primero". Queda en `docs/BACKLOG.md` como pendiente, no se construye acá.

## Alternativas descartadas

- **Tablas nuevas paralelas (`traslados`/`traslado_lineas`)**, como proponía el análisis
  sin fusionar. Descartada: dejaría dos modelos de traslado compitiendo para siempre — dos
  RLS, dos formas de resolver "qué se movió" desde `movimientos`, y `fn_movimientos`
  tendría que conocer a los dos de por vida. `transferencias`/`transferencia_items` tenían
  0 filas en producción (`transferencia_items_movimiento_fkey`) — el costo de extenderlas
  era bajo.
- **Modelar "en tránsito" como una ubicación fantasma** (una fila en `ubicaciones` tipo
  `transito`, reusando `tipo='traslado'` dos veces: origen→tránsito, tránsito→destino).
  Se ve elegante porque reutiliza el motor tal cual, pero contamina cada selector de
  ubicación de la app (ventas, compras, conteos, el switcher del líder) para un beneficio
  que el modelo elegido ya da sin ese costo.
- **Confirmar solo con líder.** Descartado por Felipe: generaría cuellos de botella
  reales si el líder de esa sede no está presente cuando llega la mercadería — el control
  de líder se reserva para el momento que de verdad lo necesita (aprobar una diferencia).

## Consecuencias

- `transferir()` se retiró (no queda viva en paralelo); su único llamador confirmado
  (`MoverMercaderiaFormV2.tsx`) se actualizó en el mismo cambio.
- **Encontrado al aplicar (no al diseñar):** mi primer intento de `create or replace
  function fn_movimientos(...)` usó la firma vieja de 11 parámetros — `20260915204457_
  movimientos_por_producto.sql`, llegada a `main` de otra sesión después de mi auditoría
  original, ya le había agregado un 12º parámetro (`p_producto_id`). El resultado fue DOS
  `fn_movimientos` ambiguos a la vez ("function ... is not unique"), no un reemplazo — se
  corrigió partiendo del cuerpo de esa migración, no del original.
- **Encontrado probando en navegador (no por SQL):** la pierna de entrada mostraba
  "Taller → —" en Movimientos, en vez de "Taller → Tienda Lima" — cada pierna del modelo
  nuevo solo trae SU lado (`m.ubicacion_destino_id` queda `null` a propósito, ver
  `movimientos_traslado_tiene_destino`), a diferencia de una fila atómica vieja que traía
  los dos. Se corrigió resolviendo el origen/destino a mostrar desde la fila de
  `transferencias` (siempre la misma para las dos piernas), no desde la fila individual.
- **Se rompe si** se agrega un tercer camino que escriba `movimientos` con `motivo` que
  empiece con `traslado_` sin sumarlo a la categorización de `fn_movimientos`/
  `fn_movimientos_resumen` — caería silenciosamente en la categoría genérica de su `tipo`.
- El seed (`supabase/seed.sql`) se actualizó para llamar `iniciar_traslado` +
  `registrar_recepcion_traslado` + `confirmar_traslado` en vez de `transferir()` —
  confirma limpio en el mismo momento, no simula el viaje de 20 horas, para que el resto
  del guion (reposición de piso, ventas) siga viendo el stock en destino como antes.
