# Fase 5 — recetas verificadas en vivo (2026-09-22)

> Resultado completo del workflow de investigación (7 agentes en paralelo + síntesis cruzada) que verificó
> cada tabla/trigger/RPC de postventa, gastos y producción del Taller contra producción en vivo (proyecto
> Supabase `vovjyyiafkxteijimpuy`, schema `retail`), no contra el texto del plan original (que para ese
> punto ya tenía un día y varias migraciones de encima). El resumen ejecutivo vive en
> `docs/adr/0150-datos-de-demostracion-90-dias.md` (sección «Investigación de la Fase 5 y primer parche»);
> este archivo es el detalle completo que ese resumen deja afuera — la receta que hace falta para escribir
> el resto de `scripts/demo/sembrar-90-dias.sql` sin tener que reinvestigar nada.

**Ya implementado y comprometido** (ver el commit `925fec11`): Fase 5.1 (serie de NC) y el parche a la Fase 4
(sección 4.6b, selección de anulaciones). Lo que sigue es la receta de las 6 áreas que faltan.

---

## Síntesis cruzada (leer primero — cambia cómo se usan las 7 recetas de abajo)

# Crítica cruzada — Fase 5 (7 áreas), antes de escribir el generador SQL

Verifiqué en vivo (vovjyyiafkxteijimpuy/retail, hoy) tres piezas que ningún agente había leído juntas: `pg_get_functiondef(anular_venta)` y los triggers reales sobre `cambios`, `devolucion_items` y `comprobantes`. Eso cambia la severidad de los hallazgos 1 y 6 de "sospecha" a "confirmado".

## 1. BLOQUEANTE — Devoluciones no excluye los tickets de Anulaciones (cruza a, c)

`anular_venta` (leída completa hoy) confirma que el chequeo "¿el ítem ya tiene cambio o devolución?" es **solo de aplicación** (un `if exists(...)` dentro del RPC) — no hay ningún trigger que lo replique en sentido inverso. Como Fase 5 hace `INSERT`/`UPDATE` directos (no llama al RPC), nada impide que Anulaciones deje `ventas.estado='anulada'` sobre un ticket que Devoluciones u otro `cambios` ya tocó, o viceversa.

Lo que sí hay, confirmado por `pg_trigger` hoy:
- `devolucion_items_venta_no_anulada` y `cambios_venta_no_anulada` (`fn_linea_de_venta_no_anulada`, BEFORE INSERT) — abortan si `venta.estado='anulada'`.
- **Uno nuevo que ningún agente reportó:** `comprobantes_venta_no_anulada` y sobre todo `comprobantes_valida_nota_referencia` → `fn_valida_nota_referencia_aceptada()`: para `tipo in ('nota_credito','nota_debito')` exige que el `comprobante_original_id` referenciado tenga `estado='aceptado'`, si no aborta con `'Solo se puede emitir una nota sobre un comprobante ya aceptado por SUNAT'`.

`anular_venta` deja el comprobante original en `estado='no_emitido'` para los ~50 tickets de Anulaciones. Si Devoluciones (que emite NC vía `emitir_nota`, y el propio agente de devoluciones ya sabe que el comprobante original debe copiarse completo) elige por azar uno de esos mismos ~50 tickets, la transacción entera aborta en `comprobantes_valida_nota_referencia` — un tercer camino de fallo, más temprano que el ya identificado de `fn_reservar_numero_serie`.

**Regla correcta:** las tres áreas que seleccionan sobre el pool de ~7000 ventas (Anulaciones ~50, Cambios ~210, Devoluciones ~140) deben filtrar por `NOT EXISTS (select 1 from tmp_venta_anulada where ticket_id = …)` — `tmp_venta_anulada` ya existe desde la Fase 4, así que el orden de escritura de las secciones no resuelve esto, solo el filtro en la query de selección de candidatos lo hace. El propio agente de Anulaciones ya lo pidió; el de Cambios ya lo adoptó en su receta; **el de Devoluciones no lo menciona en absoluto** y además su propia justificación de por qué el trigger es "inofensivo" ("el seed nunca deja una venta en estado 'anulada'") queda invalidada en cuanto la sección de Anulaciones exista — es la premisa de un área que ya no es cierta una vez que se ensambla con las demás.

## 2. Cambios ↔ Devoluciones: mismo venta_item, sin exclusión mutua (a)

Ninguna de las dos recetas hace `NOT EXISTS` contra la otra. El propio agente de Cambios lo señala como pregunta abierta, no como hecho resuelto ("¿reparto por hash antes de generar, o exclusión unilateral?"). Sin eso, un `venta_item` puede terminar con `cambios.cantidad + devolucion_items.cantidad > venta_items.cantidad` — no hay CHECK que lo bloquee (regla de negocio sin constraint, principio 2 de CLAUDE.md violado en silencio, sin abortar).

**Regla correcta:** particionar el pool de venta_items por hash determinista **antes** de que cualquiera de las tres áreas (Anulaciones, Cambios, Devoluciones) elija candidatos — un solo `NOT EXISTS` cruzado no alcanza porque son tres, no dos. Claves de hash ya propuestas y compatibles entre sí: `'anular:'`, `'cambio:'`, `'devolucion:'` — falta que las tres consulten la tabla de exclusión de las otras dos, no solo la de Anulaciones.

## 3. Cuadre de caja: tres áreas lo tocan, ninguna se hizo dueña, y el estilo de parche a Fase 4 es inconsistente (c)

Gastos, Cambios y Devoluciones **coinciden en el diagnóstico** (cajas ya cerradas por Fase 4 con una fórmula incompleta, `monto_cierre_sistema` desincronizado) pero cada una lo deja como pregunta abierta ("¿quién recalcula?"). Nadie reclamó el rol.

Además hay una inconsistencia de método entre áreas: Anulaciones propone parchear el chequeo `4.8-(4)` **in situ**, dentro de la Fase 4 ya commiteada, para que siga en verde con el nuevo `tmp_venta_anulada`. Gastos/Cambios, en cambio, no tocan los chequeos `(7)`/`(8)` de Fase 4 — los dan por obsoletos y piden un **pase final nuevo** al cierre de la Fase 5. Mezclar ambos estilos en el mismo script final es el problema: si cada agente parcha su propio chequeo donde lo encontró, quedan dos filosofías (parche en el sitio vs. recálculo al final) más el riesgo de conflicto de merge que el propio agente de Anulaciones ya advirtió sobre las líneas ~1979-1980.

**Regla correcta:** un único paso "Fase 5.9 — cierre financiero", después de que Devoluciones + Cambios + Gastos ya insertaron todo, que recalcule por cada caja tocada `monto_cierre_sistema` con la fórmula completa de `cerrar_caja()` (apertura + ventas_efectivo(no anuladas) + ingresos − egresos − reembolsos_efectivo + cambios_efectivo) y ajuste `monto_cierre_real` en la misma medida (preservando `diferencia`, incluidas las 2 cajas A1 forzadas). Los chequeos `(7)`/`(8)` de Fase 4 se dejan como validación de un estado intermedio (siguen siendo ciertos en ESE punto del script); el chequeo final de cajas se reescribe para correr después de 5.9, no dentro de Fase 4.

## 4. Producción-infraestructura vs Producción-órdenes: mecanismo de `insumo_lotes` en conflicto, no solo el orden (b, d)

El orden "infra antes que órdenes" es correcto y ambos agentes lo asumen — pero **cómo** se crean los `insumo_lotes` no está de acuerdo entre ambos:
- Infra propone `INSERT` directo de compra, con `comprobante_item_id`/`recepcion_id` en `NULL` (sin pasar por `comprobantes_produccion`).
- Órdenes descubrió en vivo que esas mismas columnas son **FK reales** a `comprobantes_produccion_items`/`comprobantes_produccion_recepciones`, y que de los ~12 `comprobantes_produccion` algunos deben ser compra real de insumo cuyo lote es lo que las OP consumen por FIFO — es decir, órdenes espera lotes *trazables* a un comprobante, infra planea generarlos *sin* trazabilidad.

Ninguna de las dos preguntas abiertas de cada agente ("¿cuánto consume una OP?" / "¿cuántos de los 12 comprobantes son compra real vs. concepto libre?") se resolvió contra la otra receta, así que el volumen de `insumo_lotes` (150-400m tela, 500-3000u avíos, estimado por infra sin BOM) no está verificado contra lo que órdenes va a consumir — el propio agente de infra ya pidió el chequeo final `select … from v_insumo_saldos where fisico<0` pero no puede escribirlo solo.

**Regla correcta:** fusionar infra + órdenes en un solo bloque de Fase 5 escrito por un solo autor, en este orden estricto: `proveedores_produccion` → `insumos` → `comprobantes_produccion`(+items) → `comprobantes_produccion_recepciones` → `insumo_lotes` (con FK reales, no NULL) → `movimientos_insumo` tipo `compra` → `producciones`(OP) → `movimientos_insumo` tipo `consumo` (FIFO) → `cerrar_produccion`. El chequeo `fisico<0` va al final de ese bloque combinado, no como promesa cruzada entre dos recetas separadas.

## 5. Cuarentena depende de un supuesto que ni Devoluciones ni Cambios confirmaron (b)

El agente de `conteos_cuarentena` condiciona su receta a que Devoluciones y Cambios simulen el bucket de stock `sub='cuarentena'` al crear cada `prendas_danadas` (para que `resolver_prenda_danada`/`liquidar_prenda_danada` tengan de dónde restar). Ni la receta de Devoluciones ni la de Cambios (en lo mostrado) confirman explícitamente que escriben ese bucket — es un supuesto de la parte consumidora, no un compromiso de las productoras.

**Regla correcta:** antes de fijar el SQL, Devoluciones y Cambios deben confirmar por escrito que su simulación de stock incluye una entrada en `sub='cuarentena'` por cada prenda dañada que generan; si no, Cuarentena debe crear esa entrada ella misma justo antes de resolver (mismo movimiento, no una fila nueva de `prendas_danadas` — ya lo tienen claro por el UNIQUE).

## 6. El objetivo de 30 `prendas_danadas` no tiene reparto confirmado, y verifiqué que Anulaciones NO contribuye (d)

Confirmado en vivo: `anular_venta` **no** inserta en `prendas_danadas` para ninguna de sus condiciones (`danada_reparacion`/`danada_donar`/`devolver_proveedor` quedan solo como texto en `venta_anulacion_items.condicion`, sin flujo de cuarentena). Así que el pool de ~30 depende 100% de Devoluciones (12% de 140 ≈ 17 por `motivo_codigo='defecto'`) + Cambios (proporción de `motivo='defecto'` no especificada en su receta). Nadie sumó ambas cifras contra el objetivo de 30 — es exactamente la pregunta abierta que el propio agente de Cuarentena dejó sin responder, y confirmo que es real, no solo prudencia.

**Regla correcta:** fijar la proporción de `defecto` en Cambios de forma que `17 + (proporción_cambios × 210) ≈ 30`, y que quien ensambla el script lo verifique con una consulta antes de cerrar, no que quede como esperanza estadística.

## 7. Volúmenes 140/210/50 — el riesgo de colisión de (1) y (2) también es un riesgo de volumen (d)

Si el `NOT EXISTS` triple del hallazgo 1 no se implementa, el fallo no es solo el abort de transacción: en el mejor caso (donde no dispara ningún trigger) dos áreas insertando sobre el mismo `venta_item` sin coordinarse entregan **menos** de lo pactado en la que pierde la carrera, o insertan un estado imposible que ninguna cuenta como "no cubierto" porque el `INSERT` sí tuvo éxito. No es un hallazgo nuevo — es la misma causa raíz de 1 y 2, mencionada aquí solo para que quien arme el volumen final sepa que 140/210/50 no están garantizados hasta que la partición por hash sea real y compartida entre las tres áreas.

---

### Orden global recomendado para el ensamblador final

`Producción-infra+órdenes (fusionadas, hallazgo 4)` → `Conteos Parte A (independiente)` → `Anulaciones, Cambios, Devoluciones (candidatos elegidos con partición de hash triple-excluyente, hallazgos 1+2)` → `Cuarentena Parte B (tras confirmar hallazgo 5)` → `Gastos/Proformas` → `Cierre financiero de cajas único (hallazgo 3)` → `Fase 6 (stock derivado)`.

---

## Devoluciones + Nota de Crédito

### Drift encontrado
- BLOQUEANTE nuevo (no estaba en la lista del arquitecto): series_comprobantes NO tiene ninguna fila tipo='nota_credito' en producción (TRU y AQP solo tienen boleta/factura/nota_venta). fn_reservar_numero_serie('nota_credito') — llamada tanto por emitir_nota() como chequeada explícitamente dentro de aprobar_devolucion — abortaría con 'No hay una serie registrada para nota_credito en esta ubicación' en casi todas las ~140 devoluciones (95% son TRU/AQP). Esto coincide con la nota de BITACORA/memoria: la serie de NC 'se registra cuando la pantalla se lo ofrezca' — es decir, hoy 2026-09-22 sigue sin registrarse.
- aprobar_devolucion() y rechazar_devolucion() NO cambiaron de firma ni de lógica hoy (confirmado con pg_get_functiondef en vivo) — coincide con lo que el arquitecto pidió confirmar.
- Dos triggers BEFORE INSERT que el arquitecto no mencionó, ambos de la migración de anulación/reintento: devolucion_items_venta_no_anulada (fn_linea_de_venta_no_anulada, aborta si la venta del venta_item está 'anulada') y comprobantes_venta_no_anulada (fn_comprobante_de_venta_no_anulada, mismo chequeo para comprobantes.venta_id). Inofensivos para esta receta porque el seed nunca deja una venta en estado 'anulada' (Fase 4 las siembra todas 'completada' y esta fase no las toca) y la NC se inserta con venta_id NULL (el trigger de comprobantes retorna temprano si venta_id es null).
- fn_aplicar_movimiento() NO es un trigger sobre movimientos — es una llamada explícita dentro de los RPC reales, que este seed (por diseño, ver encabezado del archivo: Fase 6 = 'stock derivado y cierre') NO reproduce. Confirmado que ninguna fase anterior (1-4) escribe en la tabla stock directamente — es coherente, no hace falta tocarla en Fase 5 tampoco.
- aprobar_devolucion() calcula caja_id con `select id from cajas where ubicacion_id=... and estado='abierta'` (sin filtrar por hora) porque en producción real solo puede haber una caja abierta a la vez; para el seed histórico hay que sustituirlo por buscar en tmp_cajas (Fase 4) la fila cuya (ubicacion_id, fecha) coincide con el día Lima del aprobado_en — la receta ya lo deja así.
- emitir_nota() copia los items del comprobante ORIGINAL completo cuando no se le pasa p_items explícito (que es como lo llama aprobar_devolucion) — la NC sembrada debe llevar TODAS las líneas de la boleta/factura original, no solo las devueltas. Detalle no obvio confirmado leyendo la función en vivo.

### Riesgos cruzados con otras áreas
- El bloqueante de la serie de nota_credito es cruzado con Facturación: registrarla no es un dato sintético de este seed, es una decisión real de numeración SUNAT que le toca a Felipe (ADR-CAYLA: detenerse ante integraciones que tocan SUNAT/pagos). Si otra sesión ya la registró entre el 2026-09-21 (memoria) y hoy, hay que re-verificar antes de correr — mi verificación live de hoy (2026-09-22) la encontró todavía ausente.
- Si la sub-área 'Cambios' de Fase 5 (fuera de mi alcance) también genera devolucion_items o toca ventas, debe respetar el mismo trigger devolucion_items_venta_no_anulada — y si esa sub-área SÍ anula ventas (vía la anular_venta reescrita), debe sembrarse DESPUÉS de devoluciones/cambios sobre esa venta, nunca antes, o las líneas de venta quedan bloqueadas para devolver/cambiar.
- Si la sub-área 'Taller/gastos' de Fase 5 resuelve prendas_danadas (resolver_prenda_danada), debe hacerlo con UPDATE sobre las filas que esta receta inserta (mismo id), no con un INSERT nuevo — la tabla tiene UNIQUE(devolucion_item_id).
- prendas_danadas.resuelto_en/proveedor_id quedan sin tocar en esta receta (se quedan 'en_cuarentena'); si Felipe espera ver algunas prendas YA resueltas en la demo de 90 días, es una decisión de otra sub-área, no de 'devoluciones'.
- Fase 6 (stock derivado) depende de que TODOS los movimientos de Fase 5 (devoluciones, y lo que siembren cambios/mermas) ya estén insertados antes de recalcular — coordinar orden de fases.

### Preguntas abiertas
- ¿Ya registró Felipe la serie de Nota de Crédito para TRU y AQP en producción (pantalla Facturación → Registrar serie) desde la última vez que se verificó (2026-09-21)? Si no, el seed de devoluciones no puede aprobar ninguna devolución con comprobante aceptado sin abortar — hay que decidir si (a) Felipe la registra primero por la pantalla real, o (b) excepcionalmente se autoriza insertar esa fila de series_comprobantes dentro de este mismo script de seed (con qué código de serie, ej. NC01/NC02).
- ¿La distribución propuesta de motivo_codigo (talla 32% / calce 22% / no_le_gusto 20% / defecto 12% / regalo 8% / otro 6%) y la de condicion (92% vendible salvo cuando motivo_codigo='defecto') son aceptables, o Felipe tiene una distribución real de otra fuente (ej. reportes de otra tienda) que prefiera calcar?
- reembolso_metodo: ¿calcar el método de pago original de la venta (mi propuesta) o sortear independientemente? Ninguna tabla lo restringe (no hay CHECK), es pura decisión de negocio.
- ¿La resolución de prendas_danadas (pasar de 'en_cuarentena' a 'liquidada'/'donada'/'devuelta_proveedor') entra en el alcance de qué sub-área de Fase 5 — 'Taller' o alguna otra que ya esté verificando gastos/mermas? Para no duplicar trabajo ni dejarlo sin dueño.

### Receta verificada

RECETA — Fase 5 · Devoluciones (verificada en vivo contra vovjyyiafkxteijimpuy/retail, 2026-09-22)

═══ BLOQUEANTE — resolver ANTES de escribir una sola nota de crédito ═══
`series_comprobantes` en producción HOY solo tiene filas `boleta`/`factura`/`nota_venta` (TRU: B004,F004,NV01; AQP: B005,F005,NV02; LIM: NV03). NO existe ninguna fila `tipo='nota_credito'` para TRU ni AQP. `fn_reservar_numero_serie(ubicacion_id,'nota_credito')` — la misma función que usa `emitir_nota()` y que el propio `aprobar_devolucion` chequea antes de llamarlo — hace `raise exception 'No hay una serie registrada para nota_credito en esta ubicación'`. Con ~95% de las ventas en TRU/AQP, casi todas las ~140 devoluciones intentarían crear una NC y la transacción entera abortaría en la primera. Recomendación: el seed NO debe inventar la serie (registrar una serie de facturación es una decisión de Felipe, no un dato sintético — coincide con la nota de memoria "él las registra cuando la pantalla se lo ofrezca"). Poner como primer paso de la fase un chequeo bloqueante:
```
do $$ begin
  if exists (select 1 from tmp_ubic u where u.codigo in ('TRU','AQP')
      and not exists (select 1 from series_comprobantes sc where sc.ubicacion_id=u.ubicacion_id and sc.tipo='nota_credito' and sc.archivada_at is null))
  then raise exception '[fase 5] falta serie nota_credito en TRU/AQP — Felipe debe registrarla en Facturación antes de sembrar devoluciones'; end if;
end $$;
```
Solo si Felipe confirma que la registró (o autoriza explícitamente sembrarla como parte de este script) se sigue.

═══ Helpers que se reutilizan (ya definidos arriba en el archivo, ninguno nuevo) ═══
- `pg_temp.h(k text)` — línea 443, para todo sorteo determinista (motivo_codigo, condición, fecha, hora, caja...).
- `pg_temp.sid(t,k)` — línea 767, ids `5eed…` para `devoluciones`, `devolucion_items`, `prendas_danadas`, la nota de crédito.
- `pg_temp.firmante(p_ubic, p_fecha, p_solo_lider, p_clave)` — línea 799: `solicitado_por` = `firmante(ubicacion_id, fecha_solicitud, false, 'devol:'||id)` (cualquier colaborador/líder de esa tienda, como "operador"); `aprobado_por`/rechazado_por = `firmante(ubicacion_id, fecha_resolucion, true, 'devolresuelve:'||id)` (solo líder, sin atarlo a la tienda — `fn_es_lider()` es un rol global, no de sede, confirmado en `aprobar_devolucion`/`rechazar_devolucion` en vivo: ninguna llama a `fn_puede_operar_ubicacion`).
- `tmp_ubic` (Fase 3, línea 775) — para `sub_piso`. Le falta `sub_cuarentena`: agregar una columna nueva a partir de él (no un helper nuevo):
  `select id from sububicaciones where ubicacion_id=u.ubicacion_id and tipo='cuarentena'` — confirmado en vivo: TRU/AQP/LIM tienen exactamente 1 sububicación `cuarentena` cada una.
- `tmp_cajas` (Fase 4, línea 1786) sigue viva en la misma transacción — de ahí sale `caja_id`, NO de consultar `cajas.estado='abierta'` en la tabla real (todas quedaron `'cerrada'` al final de la Fase 4, a propósito). Emular "la caja abierta en ese instante" = `tmp_cajas` filtrado por `(ubicacion_id, fecha)` igual que hace `tmp_venta_cab` en 4.3 — las ventanas de caja no cruzan medianoche, así que basta con la fecha Lima del instante, no un rango de timestamp.
- `tmp_venta_cab` / venta_items reales ya insertados en 4.4 (id = `pg_temp.sid('vi', ticket_id||':'||variante_id)`) y `tmp_lineas` (Fase 2, tiene `precio_unitario`, `cantidad`) son el universo de líneas devolvibles.
- Comprobante original: `select * from comprobantes where venta_id=... and tipo in ('boleta','factura') and estado='aceptado' order by created_at desc limit 1` (exactamente el filtro de `aprobar_devolucion`). Para LIM no hay fila → se salta la NC (no es un bug, es la regla real, ya lo dice el plan).

═══ INSERT directo (una sola fila final por devolución, no simular el ciclo crear→aprobar) ═══
Igual que Fase 4 insertó `ventas` ya `'completada'` y `cajas` ya `'cerrada'`, cada devolución se inserta UNA vez con su estado final — no hace falta un INSERT "pendiente" seguido de un UPDATE.

`devoluciones` (columnas confirmadas en vivo — `motivo` NOT NULL, `motivo_codigo` nullable pero con CHECK a la lista cerrada, `solicitado_por`/`caja_id`/`aprobado_por`/`aprobado_en`/`reembolso_monto`/`reembolso_metodo`/`nota_credito_id` todos nullable):
```
id, venta_id, ubicacion_id, motivo, motivo_codigo, solicitado_por, created_at,
estado, caja_id, aprobado_por, aprobado_en, reembolso_monto, reembolso_metodo, nota_credito_id
```
- `motivo_codigo`: distribución sugerida (no verificable "en vivo" por ser dato de negocio, pero plausible para ropa retail — usar `pg_temp.h('motivo:'||devolucion_id)` con umbrales acumulados, mismo patrón que `pg_temp.metodo_por_umbral`):
  talla 32% · calce 22% · no_le_gusto 20% · defecto 12% · regalo 8% · otro 6%.
- `motivo` (texto libre, NOT NULL): una frase fija por código — "No le quedó la talla", "No le calzó bien", "Se arrepintió / no le gustó", "Prenda con defecto", "Era un regalo, no le sirvió", "Otro motivo" — no hace falta variarla más, es texto de relleno.
- `condicion` de cada ítem (ver abajo) se correlaciona con `motivo_codigo`: si `motivo_codigo='defecto'` → `condicion` sale de `{danada_reparacion, danada_donar, devolver_proveedor}` (p.ej. 50/30/20); para cualquier otro motivo → `'vendible'` en ~92% de los casos y `danada_*` en el 8% restante (prenda que "parecía bien" pero al revisar tenía un defecto).
- Volumen: ~140 filas totales — 3 `pendiente`, 2 `rechazada`, el resto (~135) `aprobada` (candado A12). Elegir esas 5 filas de forma determinista (p.ej. las de menor `pg_temp.h('marcaA12:'||id)`) para que sean siempre las mismas.
- Fecha de solicitud (`created_at`): `fecha_venta + floor(pg_temp.h('diasdev:'||id) * 16)` días (0–15, R-38), acotada a `<= corte` (helper `tmp_v3.corte`/`tmp_ventana.corte`); hora dentro del horario de la tienda ese día (reusar `tmp_dias.abre/cierra`, mismo truco de `pg_temp.h('hora:'...)` que usa Fase 2/4).
- `caja_id`: SIEMPRE se calcula igual (aprobada, rechazada o pendiente da lo mismo para esta columna — pero en vivo `aprobar_devolucion` solo la llena al aprobar; `crear_devolucion`/`rechazar_devolucion` nunca la tocan) → **para `pendiente`/`rechazada`, `caja_id` queda NULL**; para `aprobada`, `caja_id` = la fila de `tmp_cajas` de esa `ubicacion_id` en la fecha Lima de `aprobado_en` (si no hay ninguna — solo puede pasar en el borde del último día — no elegir esa fecha para una devolución que se vaya a aprobar, para no dejar `caja_id` NULL en una fila que el RPC real sí habría llenado).
- Para `pendiente`: `estado='pendiente'`, `aprobado_por`/`aprobado_en`/`reembolso_monto`/`reembolso_metodo`/`nota_credito_id`/`caja_id` = NULL (coincide con CHECK `devoluciones_aprobacion_coherente`).
- Para `rechazada`: `aprobado_por` = firmante líder, `aprobado_en` = instante de resolución (créate_en + algo, `<= corte`), `motivo` = `motivo || ' · rechazada: ' || detalle` (repetir EXACTO el `concat_ws(' · ', motivo, 'rechazada: '||coalesce(p_motivo,'sin detalle'))` de `rechazar_devolucion`, confirmado en vivo — usar detalles como "fuera de plazo", "prenda con signos de uso", "no corresponde a política de la tienda"); `caja_id`/`reembolso_*`/`nota_credito_id` = NULL.
- Para `aprobada`: `aprobado_por` = firmante líder, `aprobado_en` = instante de aprobación (`>= created_at`, `<= corte`); `reembolso_monto` = Σ `precio_unitario × cantidad` de los ítems de ESA devolución (sin descuento, igual que `v_total_devuelto` en vivo); `reembolso_metodo` = el método de pago de la venta original si fue uno solo, o `'efectivo'` si la venta pagó con dos medios (simplificación razonable); `caja_id` según arriba; `nota_credito_id` = el id de la NC si hubo comprobante `aceptado` de esa venta (solo TRU/AQP) y NULL en LIM.

`devolucion_items` (UNIQUE real es `(devolucion_id, venta_item_id)`, no `(devolucion, línea)` textual — incluye `venta_item_id` NOT NULL, `movimiento_id` nullable, sin columna `created_at`):
```
id, devolucion_id, venta_item_id, cantidad, condicion, movimiento_id
```
- `cantidad` = la cantidad COMPLETA del `venta_item` elegido (no parcial — más simple y evita chocar con el candado de `crear_devolucion` que exige `v_ya_devuelto + cantidad <= venta_item.cantidad`).
- `movimiento_id`: NULL en `pendiente`/`rechazada`; en `aprobada`, el id del movimiento creado abajo.

`movimientos` (solo para devoluciones `aprobada`; confirmado en vivo que `fn_aplicar_movimiento()` NO es un trigger — es una llamada explícita dentro de `aprobar_devolucion`, y esta fase no la reproduce: **el header del archivo ya dice que `stock` derivado es Fase 6**, así que NO hay que tocar la tabla `stock` acá, solo `movimientos`):
```
id, variante_id, ubicacion_id, sububicacion_id, tipo='entrada', cantidad, motivo='devolucion', devolucion_item_id, usuario_id, created_at
```
- `usuario_id` = el `aprobado_por` de la cabecera; `created_at` = `aprobado_en` (el "mismo instante del acto").
- `sububicacion_id`: si `condicion='vendible'` → `tmp_ubic.sub_piso` (confirmado: `fn_sububicacion_por_defecto(ubicacion,'venta')` resuelve a `tipo='piso_venta'`); si `condicion` es cualquiera de `danada_reparacion|danada_donar|devolver_proveedor` → `sub_cuarentena` de esa tienda (ver 5.D.1 arriba) — las tres condiciones "no vendibles" van al MISMO destino, confirmado en vivo (el `if/elsif` de `aprobar_devolucion` las trata igual).

`prendas_danadas` (solo para ítems con `condicion <> 'vendible'`; `created_at` tiene default `now()` así que hay que fijarlo explícito; NO tocar `estado` (queda `'en_cuarentena'` por default), NI `resuelto_en`/`resuelto_por`/`movimiento_salida_id`/`proveedor_id` — confirmado por CHECK `prendas_danadas_resolucion_coherente`: en `en_cuarentena` esas tres deben quedar NULL, y por `prendas_danadas_un_origen`: exactamente uno de `devolucion_item_id`/`cambio_id` no nulo):
```
id, variante_id, ubicacion_id, cantidad, devolucion_item_id, movimiento_entrada_id, created_at
```
- `created_at` = `aprobado_en`. La resolución de estas prendas (venderlas de liquidación, donarlas, devolverlas al proveedor) es un paso POSTERIOR (`resolver_prenda_danada`) que no pertenece a "devoluciones" — si otra sub-área de Fase 5 (Taller/gastos) decide resolver algunas, que actualice esta misma fila, no inserte una nueva.

Nota de crédito — solo si `venta.ubicacion` ∈ {TRU, AQP} Y existe comprobante `aceptado` de esa venta (`comprobantes`, reutilizando exactamente el patrón de la Fase 4.7: `fn_reservar_numero_serie` + `entorno_transmision='sandbox'` + `respuesta_sunat='{"seed":true}'::jsonb` forzados a `estado='aceptado'`, en vez de dejarlo `pendiente` como haría `emitir_nota()` real):
```
id, ubicacion_id, tipo='nota_credito', serie, numero, cliente_tipo_doc, cliente_num_doc, cliente_nombre,
moneda='PEN', subtotal, igv, total, estado='aceptado', usuario_id, comprobante_original_id, motivo, items,
entorno_transmision='sandbox', respuesta_sunat='{"seed":true}'::jsonb, created_at, enviado_at
```
- `serie`/`numero`: `select serie, numero from fn_reservar_numero_serie(comprobante_original.ubicacion_id, 'nota_credito')` (misma técnica que 4.7 para boleta/factura — avanza `series_comprobantes` de verdad).
- `cliente_tipo_doc`, `cliente_num_doc`, `cliente_nombre`: COPIADOS del comprobante original (`emitir_nota` los copia de `v_original`, no los recalcula).
- `total` = `reembolso_monto` de la cabecera (= Σ precio_unitario×cantidad de los ítems devueltos); `igv = round(total − total/1.18, 2)`; `subtotal = round(total − igv, 2)` — mismo orden de redondeo que Fase 4.7 y que `aprobar_devolucion` en vivo (IGV primero).
- `motivo` (columna de `comprobantes`, el código SUNAT — NO confundir con `devoluciones.motivo`): `'06'` si esta devolución cubre el 100% de CADA línea de la venta original (comparar contra TODOS los `venta_items` de esa venta, no solo el devuelto — replicar el `select not exists(...)` de `aprobar_devolucion`), si no `'07'`.
- `comprobante_original_id` = id del comprobante `aceptado`. **Obligatorio llenarlo** — el trigger `comprobantes_valida_nota_referencia` (`fn_valida_nota_referencia_aceptada`, confirmado en vivo) hace `select estado from comprobantes where id=new.comprobante_original_id`; si viene NULL, la subconsulta no devuelve fila, `v_estado` queda NULL, `NULL is distinct from 'aceptado'` es TRUE → aborta con "Solo se puede emitir una nota sobre un comprobante ya aceptado". Además el CHECK `comprobantes_nota_requiere_original` exige `comprobante_original_id` y `motivo` no nulos para tipo `nota_credito`/`nota_debito`.
- `items` = **los items del comprobante ORIGINAL completo** (`v_original.items`, todas las líneas de la boleta/factura, no solo las devueltas) — así lo hace `emitir_nota()` por default (`coalesce(p_items, v_original.items)`) cuando nadie pasa `p_items` explícito, que es el caso real vía `aprobar_devolucion`. Contraintuitivo pero confirmado en vivo: copiar tal cual `comprobantes.items` del original.
- `created_at` = `enviado_at` = `aprobado_en` (mismo instante del acto).
- `devoluciones.nota_credito_id` = el id de esta fila.

═══ Chequeos de cierre (mismo formato `raise exception` que el resto del archivo, `[check devoluciones]`) ═══
1. `count(devoluciones id 5eed%) between ~130 and ~150`; exactamente 3 `pendiente` y 2 `rechazada`.
2. Ninguna `aprobada` con `aprobado_en < created_at`.
3. Toda `aprobada` con `caja_id is null` → falla (salvo que se acepte explícitamente el borde del último día).
4. `devolucion_items.cantidad <= venta_item.cantidad` para cada fila (replicar el candado de `crear_devolucion`).
5. Ninguna fila de `movimientos`/`prendas_danadas` fechada fuera de `[created_at devolución, corte]`.
6. Todo comprobante `nota_credito` sembrado con `comprobante_original_id` cuyo `estado='aceptado'` (auto-chequeo, aunque el trigger ya lo garantiza).
7. `distinct motivo_codigo` >= 5 de los 6 valores (para no dejar "no todas el mismo" sin verificar).
8. Firmantes: `aprobado_por`/`solicitado_por` con `personas.fecha_ingreso <= fecha del acto`, igual que los chequeos (6) de Fase 3/4.

---

## Cambios de talla/color

### Drift encontrado
- registrar_cambio(p_venta_item_id, p_ubicacion_id, p_variante_nueva_id, p_cantidad=1, p_metodo_pago_diferencia=null, p_token=null, p_motivo=null, p_condicion='vendible') — firma VIVA con 8 parámetros (la del archivo de migración 20260916180000 solo tenía 6; p_motivo/p_condicion los agregó una migración posterior — 'cambios_motivo_y_estado_de_prenda', 20260919 según el nombre del archivo local — que NO aparece en supabase_migrations.schema_migrations con LIKE '%cambio%' LIMIT 10: otro caso del 'historial de migraciones de prod no es fiable' de CLAUDE.md. Confío en pg_get_functiondef, que es la fuente viva, no en la tabla de versiones.
- cambios.caja_id es NULLABLE — no hay ningún CHECK que lo exija. El candado real ('si hay diferencia en efectivo, exige caja abierta o rechaza') vive SOLO dentro de registrar_cambio() como RAISE EXCEPTION de aplicación, no como constraint de tabla. Un INSERT directo mal armado no fallaría por esto — la receta debe replicarlo por fidelidad, no porque la base lo obligue.
- cerrar_caja() fue reescrita (migración diferencia_de_cambio_en_el_arqueo, 2026-09-15) para sumar cambios.diferencia (filtrado a metodo_pago_diferencia='efectivo') a monto_cierre_sistema. Fórmula viva completa: monto_apertura + ventas_efectivo(v.estado<>'anulada') + ingresos - egresos - reembolsos_efectivo(devoluciones aprobadas en efectivo) + cambios_efectivo. Las cajas que la Fase 4 YA sembró calcularon monto_cierre_sistema SOLO como apertura + efectivo de sus ventas (sin estos 4 términos). Esto NO estaba en la lista de drift ya confirmada por el arquitecto y afecta directo a mi área en cuanto uso metodo_pago_diferencia='efectivo'.
- Hay un trigger BEFORE INSERT en cambios (cambios_venta_no_anulada → fn_linea_de_venta_no_anulada) que bloquea a nivel de MOTOR (no solo dentro del RPC) cualquier INSERT en cambios cuyo venta_item apunte a una venta con estado='anulada'. Un INSERT directo de la receta SÍ dispara este trigger.
- cambios.token_cliente tiene un índice único parcial (WHERE token_cliente IS NOT NULL) para idempotencia de cliente — no mencionado en el plan; para el seed corresponde dejarlo NULL siempre (múltiples NULL no violan el índice).
- Sin drift en lo que el plan ya asumía: motivo enum exacto (talla_chica|talla_grande|otro_color|defecto|otro), condicion enum (vendible|no_vendible), CHECK defecto⇒no_vendible, diferencia=(variantes.precio nueva − venta_items.precio_unitario de lista)×cantidad, los dos movimientos con cambio_id y sin venta_item_id — todo confirmado byte a byte contra pg_get_functiondef(registrar_cambio) vivo.
- registrar_cambio NO exige rol de líder (solo fn_puede_operar_ubicacion, el mismo candado de permiso por ubicación que usa registrar_venta) — a diferencia de compras/pagos/notas de crédito de la Fase 3, que sí exigen líder. El usuario_id del cambio puede ser cualquier colaborador asignado a la sede.

### Riesgos cruzados con otras áreas
- anular_venta bloquea la VENTA COMPLETA (no solo el ítem tocado) si CUALQUIERA de sus venta_items tiene una fila en cambios — ya confirmado por el arquitecto, pero además está reforzado por un trigger de motor (cambios_venta_no_anulada) que corre en el INSERT de cambios, no en la anulación: si la receta de anulaciones corre PRIMERO y deja una venta en estado 'anulada', cualquier intento posterior de esta receta de insertar un cambio sobre uno de sus ítems será rechazado por el trigger aunque el INSERT sea directo. Conclusión operativa: hay que particionar el pool de ~7000 ventas de la Fase 4 en dos subconjuntos DISJUNTOS por venta_id (determinista por hash, no por orden de ejecución) antes de que cualquiera de las dos recetas elija candidatos — no alcanza con 'que cada una revise lo que hizo la otra', porque dentro de una misma transacción ambas fases corren en el mismo script y el orden importa.
- Cuadre de caja: cualquier cambio con metodo_pago_diferencia='efectivo' que la receta inserte sobre una caja que la Fase 4 ya cerró deja esa caja con monto_cierre_sistema/diferencia desincronizados de lo que cerrar_caja() calcularía hoy — y el chequeo (8) de la Fase 4 ('exactamente 2 cajas con diferencia, A1') queda falso apenas se sumen cambios (y luego devoluciones con reembolso en efectivo, y luego ingresos/egresos de gastos — todos suman al mismo hueco). No es solo mi problema: es compartido con devoluciones y con gastos/caja_movimientos de otras sub-áreas de la Fase 5. Recomiendo UNA sola pasada final (después de insertar TODO lo de la Fase 5) que recalcule cajas.monto_cierre_sistema y diferencia con la fórmula exacta de cerrar_caja() para cada caja tocada, y que Felipe decida ahí si el A1 original se preserva ajustando monto_cierre_real en vez de diferencia, o si pasa a documentarse como una anomalía nueva.
- prendas_danadas.cambio_id es UNIQUE (1:1) — si alguna otra sub-área de la Fase 5 llega a 'resolver' las prendas dañadas que un cambio dejó en cuarentena (liquidar/botar/devolver a proveedor), esa resolución debe hacer UPDATE sobre la MISMA fila (mismo cambio_id), nunca insertar una segunda.
- v_ya_cambiado + p_cantidad <= venta_items.cantidad es una regla de negocio SOLO dentro de registrar_cambio(), sin CHECK de tabla que la replique — si alguna otra receta de la Fase 5 (p.ej. devoluciones) también consume venta_items por su cuenta, hay que sumar cambios+devoluciones del mismo ítem contra su cantidad original al elegir candidatos, porque un INSERT directo que la exceda no fallaría solo (estado imposible según el principio 2 de CLAUDE.md, no detectado por ningún constraint).

### Preguntas abiertas
- ¿Quién recalcula cajas.monto_cierre_sistema/diferencia al cierre de toda la Fase 5 — esta receta de 'cambios', la de 'gastos/caja', o un paso aparte del propio Felipe al armar el SQL final? Hay que decidirlo antes de escribir el SQL para no duplicar el recálculo ni dejarlo sin hacer.
- ¿El reparto de ventas entre 'cambios' (~210) y 'anulaciones' se fija particionando venta_id por hash determinista ANTES de generar cualquiera de las dos secciones (recomendado), o se deja que 'anulaciones' corra primero en el archivo final y 'cambios' simplemente excluya por SQL (not exists ... ventas anuladas)? Cualquiera de las dos funciona, pero hay que elegir una y que quien escriba el SQL final lo sepa de antemano.
- El plan dice que A15 debe darse 'todas las sedes' — ¿eso exige que los ≥3 cambios de una misma dirección vengan de sedes DISTINTAS (para probar que la lectura no está limitada a una tienda), o alcanza con que ocurran en la ventana de 90 días sin importar la sede (ya que la lectura de tallasQueNoCalzan no filtra por ubicación)? El código confirma que la lectura no tiene scope de sede, pero no queda claro si el diseño de la anomalía quiere demostrar eso mezclando sedes a propósito.

### Receta verificada

RECETA — Fase 5 / Cambios (verificada en vivo contra vovjyyiafkxteijimpuy, 2026-09-22)

## 1. Esquema exacto de `cambios` (13 columnas, todas confirmadas en vivo)
id uuid PK default gen_random_uuid() — reemplazar por pg_temp.sid('cambio', clave)
venta_item_id uuid NOT NULL FK→venta_items(id)
ubicacion_id uuid NOT NULL FK→ubicaciones(id)
variante_nueva_id uuid NOT NULL FK→variantes(id)
cantidad integer NOT NULL CHECK (cantidad > 0)
diferencia numeric NOT NULL default 0
metodo_pago_diferencia text NULL CHECK IN ('efectivo','tarjeta','yape','plin','transferencia')
usuario_id uuid NULL FK→personas(id)
token_cliente uuid NULL (índice único parcial WHERE NOT NULL) → dejar SIEMPRE NULL en el seed
created_at timestamptz NOT NULL default now() → sobrescribir siempre con el ts histórico del cambio
caja_id uuid NULL FK→cajas(id)
motivo text NULL CHECK IN ('talla_chica','talla_grande','otro_color','defecto','otro') → NUNCA null en el seed (da realismo y alimenta A15)
condicion text NOT NULL default 'vendible' CHECK IN ('vendible','no_vendible')

CHECK cruzados que la receta debe respetar por construcción (no hace falta validarlos después, insertar ya bien):
- cambios_defecto_no_vuelve_al_piso: motivo='defecto' ⇒ condicion='no_vendible' (si motivo≠'defecto', condicion puede ser cualquiera de las dos, pero lo natural es 'vendible' salvo que también quieras generar prendas dañadas sin motivo 'defecto')
- cambios_diferencia_liquidada: diferencia=0 OR metodo_pago_diferencia NOT NULL
- Trigger cambios_venta_no_anulada (motor, no solo RPC): la venta del venta_item elegido NO puede estar 'anulada' — filtrar candidatos por v.estado <> 'anulada' (ver riesgo cruzado #1).
- Regla de negocio sin CHECK (replicar igual): Σ cantidad de cambios ya usados sobre ese venta_item + cantidad nueva ≤ venta_items.cantidad.

## 2. Fórmula de diferencia (idéntica a registrar_cambio, sin drift)
diferencia := (variantes.precio de variante_nueva_id − venta_items.precio_unitario del venta_item original) × cantidad
(precio_unitario es el precio DE LISTA que Fase 4 guardó en venta_items, no el precio con descuento; variantes.precio es fijo durante toda la ventana porque el seed no modela historial de precio — no hay drift de "precio histórico" que resolver).
Si diferencia ≠ 0 ⇒ metodo_pago_diferencia obligatorio (elegir con pg_temp.h, sesgando a tarjeta/yape/plin/transferencia y dejando 'efectivo' como una fracción menor para no disparar de más el riesgo cruzado de caja).

## 3. caja_id (replicar la intención real aunque no sea NOT NULL)
Igual que ventas: join por (ubicacion, fecha) contra las cajas ya sembradas en la Fase 4 (mismo patrón `pg_temp.sid('caja', t.codigo || ':' || d.fecha)` de la línea 1787). Poner SIEMPRE el caja_id del día/sede del cambio (aunque diferencia=0), igual que un cambio real siempre ocurre con una caja abierta en el mundo real de la tienda — así se evita el caso "caja_id null pero hay efectivo" que la migración 20260916180000 existe justamente para prohibir en la RPC real.
Si metodo_pago_diferencia='efectivo' y diferencia≠0: ese caja_id queda marcado para el recálculo final de monto_cierre_sistema/diferencia (ver riesgo cruzado #2) — no lo resuelve esta receta sola.

## 4. Los dos movimientos (confirmado byte a byte contra pg_get_functiondef(registrar_cambio))
Reusar pg_temp.sid('mov', clave) y pg_temp.firmante(ubicacion_id, fecha, false, clave) — sin exigir líder (registrar_cambio solo pide fn_puede_operar_ubicacion, no fn_es_lider).

Sub-ubicación de la variante NUEVA (salida) = SIEMPRE piso_venta de esa sede (tmp_ubic.sub_piso ya calculado en Fase 3) — fn_sububicacion_por_defecto(ubicacion,'venta') resuelve exactamente a 'piso_venta', confirmado.
Sub-ubicación de entrada de la variante ORIGINAL:
  - condicion='vendible' → piso_venta (mismo tmp_ubic.sub_piso)
  - condicion='no_vendible' → sububicaciones.tipo='cuarentena' de esa sede (buscar el id igual que tmp_ubic ya busca sub_almacen/sub_piso; agregar una tercera columna sub_cuarentena a tmp_ubic, o una lateral nueva)

Movimiento 1 — ENTRADA (variante ORIGINAL, la que trae la clienta):
insert into movimientos (id, variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, cambio_id, usuario_id, created_at)
values (pg_temp.sid('mov','cambio-ent:'||cambio_id), venta_item.variante_id, ubicacion_id, sub_entrada, 'entrada', cantidad, 'cambio', cambio_id, usuario_id, ts_cambio)
— SIN venta_item_id (confirmado: registrar_cambio no lo setea en este insert).

Movimiento 2 — SALIDA (variante NUEVA que se lleva la clienta):
insert into movimientos (id, variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, cambio_id, usuario_id, created_at)
values (pg_temp.sid('mov','cambio-sal:'||cambio_id), variante_nueva_id, ubicacion_id, sub_piso, 'salida', cantidad, 'cambio', cambio_id, usuario_id, ts_cambio)
— SIN venta_item_id.

Si condicion='no_vendible', UNA fila adicional (cambio_id es UNIQUE en esta tabla, 1:1):
insert into prendas_danadas (id, variante_id, ubicacion_id, cantidad, cambio_id, movimiento_entrada_id)
values (pg_temp.sid('danada','cambio:'||cambio_id), venta_item.variante_id, ubicacion_id, cantidad, cambio_id, <id del movimiento 1>)
(estado queda en su default 'en_cuarentena'; movimiento_salida_id/resuelto_en quedan NULL — el CHECK prendas_danadas_resolucion_coherente lo exige así mientras esté en cuarentena; y prendas_danadas_un_origen exige exactamente uno de devolucion_item_id/cambio_id no-nulo, aquí solo cambio_id).

## 5. Disponibilidad de stock de la variante NUEVA — "mismo criterio que ya usa la Fase 4", verificado cuál es
La Fase 4 NO calcula stock disponible al momento de vender: confía en que la Fase 3 provisionó la demanda por construcción, y lo VERIFICA después con un chequeo de saldo corrido (líneas 1571-1595):
  saldo = sum(d) over (partition by variante_id, ubicacion_id, sub order by ts, (d<0)::int, ref rows unbounded preceding)
  con d=+cantidad en entrada/ajuste positivo, −cantidad en salida; el chequeo exige min(saldo) ≥ 0 por bucket.
Ese es "el mismo criterio" a reusar para cambios: NO inventar una consulta de "stock actual" en el momento de generar cada cambio. En vez de eso:
  (a) generar primero el candidato (venta_item, variante_nueva, cantidad, ts) determinísticamente por hash,
  (b) insertar sus dos movimientos igual que los demás,
  (c) extender el MISMO chequeo de saldo corrido de la Fase 3/4 (tmp_ev) para que también incluya motivo='cambio' (entrada Y salida) antes de decidir que la Fase 5 quedó bien — si algún bucket cae negativo, es la propia Fase 3 la que no dejó suficiente stock parado para absorber cambios y hay que ajustar la reserva de slack (A6/A7 ya dejan slack a propósito: A6 son 8 pares con piso en 0 y stock en almacén — no sirven como variante_nueva de un cambio porque el piso justamente está en 0; conviene excluir esos pares como candidatos a variante_nueva).
No hace falta reinventar disponibilidad "al vuelo": la variante_nueva candidata se elige entre pares (producto, talla-distinta, sede) que en Fase 3 quedaron con slack en piso_venta (el mismo criterio "sin_venta_stock"/slack que ya calcula tmp_par), preferentemente tarde en la ventana para minimizar el riesgo de que la salida del cambio deje el piso en negativo antes de que la Fase 3 hubiera subido más stock.

## 6. Volumen y A15 (verificado contra la lectura real, apps/web/lib/cambios-reglas.ts + cambios-estadisticas.ts)
tallasQueNoCalzan() exige EXACTAMENTE: mismo productoVendidoId = productoEntregadoId (incluye producto_id, no solo referencia), tallaVendida ≠ tallaEntregada (ambas no-null), sumando cantidad por clave (producto_id, tallaVendida, tallaEntregada) y filtrando ≥ 3 (MINIMO_TALLAS_QUE_NO_CALZAN=3, confirmado en código). La ventana es getTallasQueNoCalzan(ahora=new Date()) con desde = hoy_real − 90 días — es una ventana RODANTE evaluada en el momento en que alguien abre la pantalla, no fija al w.fin del seed. Recomendación práctica: ubicar los cambios de A15 en el tercio final de la ventana de 90 días (cerca de w.fin) para que sigan siendo visibles el mayor tiempo posible después de correr el seed.
`retail.tallas` NO tiene columna de orden — la dirección "M→L" hay que codificarla a mano en el SQL final (arreglo fijo tipo ['XS','S','M','L','XL','XXL'] más una escala numérica aparte para pantalones/zapatos), pg_temp.h() para elegir producto/dirección de forma determinista, nunca random().
Para el volumen (~210 cambios totales, de los cuales ≥3 en la misma dirección de un mismo producto para A15): como venta_items.cantidad es 1 en la inmensa mayoría de líneas (Fase 2: cantidad=2 solo si pg_temp.h('qty:...')<0.06), A15 se arma casi seguro con 3+ cambios SEPARADOS (venta_items distintos, cantidad=1 cada uno) sobre el mismo producto y la misma dirección de talla — no con un solo cambio de cantidad=3 sobre un único venta_item (que normalmente no tiene esa cantidad disponible).

## 7. Chequeos de cierre de fase a agregar (mismo formato que líneas 1582-1729 y 1947-2034)
- (1) todo cambio tiene sus 2 movimientos con motivo='cambio' y el mismo cambio_id.
- (2) ningún movimiento de cambio tiene venta_item_id.
- (3) condicion='no_vendible' ⇔ existe exactamente 1 fila en prendas_danadas con ese cambio_id (y viceversa, condicion='vendible' ⇒ no existe).
- (4) diferencia=0 ⇔ metodo_pago_diferencia is null (mismo sentido que el CHECK, para no confiar solo en el constraint).
- (5) ninguna venta de un venta_item usado en cambios está en estado 'anulada' (blindaje extra sobre el riesgo cruzado #1, además del trigger que ya lo garantiza).
- (6) Σ cantidad de cambios por venta_item_id ≤ venta_items.cantidad de ese ítem (agrupado).
- (7) conteo total entre 190 y 230 (banda alrededor de ~210, mismo estilo que el chequeo (8) de compras).
- (8) al menos un (producto_id, tallaVendida, tallaEntregada) con Σ cantidad ≥ 3 (A15), reproduciendo tallasQueNoCalzan() en SQL puro.
- (9) saldo corrido de piso_venta (tmp_ev extendido) sigue sin negativos después de sumar los movimientos de cambio.
- (10) ningún cambio con metodo_pago_diferencia='efectivo' queda con caja_id null (fidelidad al candado real de la RPC, aunque no sea un CHECK de tabla).

---

## Anulaciones de venta (impacto en la Fase 4 ya comprometida)

### Drift encontrado
- anular_venta (pg_get_functiondef en vivo) confirma exactamente lo descrito: exige fn_es_lider(), venta.caja_id not null + caja.estado='abierta', aborta si hay comprobante venta_id en ('enviado','aceptado'), aborta si algún ítem ya tiene cambio o devolución no-rechazada, exige que p_items cubra las N líneas de la venta exactamente una vez cada una, y al final actualiza comprobantes a 'no_emitido' — pero el WHERE real es estado in ('pendiente','pendiente_reintento','interna'), no solo los dos primeros (irrelevante para nuestras ~50 porque Fase 4 solo emite boleta/factura, nunca nota_venta='interna').
- venta_anulacion_items.condicion tiene CHECK real ARRAY['vendible','danada_reparacion','danada_donar','devolver_proveedor'] — 4 valores, no el binario vendible/no-vendible del plan original obsoleto. UNIQUE(venta_item_id) confirma 'una vez por línea'.
- Confirmado en vivo hoy: select count(*) from venta_anulacion_items = 0, select count(*) from ventas where estado='anulada' = 0 — la Fase 4 commiteada deja 0 ventas anulables tal como advierte el contexto.
- fn_aplicar_movimiento (llamada por anular_venta para condicion='vendible') escribe en stock con INSERT..ON CONFLICT/UPDATE explícito; no hay trigger en movimientos que lo haga (verifiqué pg_trigger sobre retail.movimientos: solo movimientos_compra_foto, movimientos_inmutables, movimientos_sin_truncate — ninguno toca stock). Pero el propio archivo dice en su cabecera 'Pendiente: ... 6 (stock derivado y cierre)' — Fase 6 aún no existe y recalculará stock completo desde movimientos al cierre, así que la receta de Fase 5 no debe insertar en stock, solo en movimientos.
- El chequeo 4.8-(4) ya commiteado (líneas ~1979-1980) exige 'estado not in (aceptado)' arroje 0 filas — con el parche de Fase 4 esto revienta si no se ajusta también; no estaba en el alcance pedido pero es necesario.
- cajas.estado real hoy es siempre 'cerrada' para las ~270 cajas sembradas en Fase 4 (todas son historia ya cerrada) — el guard de anular_venta que exige estado='abierta' es un guard de tiempo real que no aplica a un INSERT directo histórico; lo que sí hay que respetar es la cronología (venta.created_at < instante de anulación < caja.cerrada_en), que la receta impone explícitamente.
- Verifiqué las 4 migraciones 'sin tocar' que menciona el contexto (cotizaciones_maquila, pedidos_no_atendidos, ficha_de_clienta_v1_backend, movimientos_busqueda_especial, productos_alertas_solo_activas_y_variantes_distintas) indirectamente: los únicos triggers en retail.movimientos son los 3 de siempre, ninguno nuevo — consistente con que ninguna de esas 4 migraciones tocó tablas de postventa/gastos/Taller.

### Riesgos cruzados con otras áreas
- Colisión de tickets entre Anulaciones/Cambios/Devoluciones: mi selección usa pg_temp.h('anular:'||ticket_id) < 0.0075 sobre TRU/AQP, materializada en tmp_venta_anulada YA EN FASE 4 (antes de que exista ninguna sección de Cambios/Devoluciones). anular_venta aborta si un ítem ya tiene cambio o devolución no-rechazada — así que las recetas de Cambios y Devoluciones DEBEN excluir explícitamente los tickets de tmp_venta_anulada (NOT EXISTS contra esa tabla, que sigue viva durante toda la transacción por ser 'on commit drop' con un solo commit al final) y usar su propia clave de hash distinta de 'anular:' (p.ej. 'cambio:'||ticket_id, 'devolucion:'||ticket_id) para no correlacionar la selección. El overlap esperado si cada receta elige independientemente ~50 de ~6645-6995 con hashes distintos es bajo (~0.3-0.4 tickets esperados) pero no cero — pido al arquitecto que fuerce este NOT EXISTS en las otras dos rectas antes de ensamblar el script final.
- Orden de ejecución dentro de Fase 5: mi receta asume que 'Anulaciones' puede insertar su movimiento/venta_anulacion_items/update en cualquier punto de Fase 5 siempre que tmp_venta_anulada (creada en Fase 4) exista — no depende de que Cambios/Devoluciones corran antes o después. Pero si Cambios/Devoluciones también escriben sobre las MISMAS ~50 sin leer tmp_venta_anulada, el orden de escritura determinaría cuál INSERT viola el UNIQUE(venta_item_id) de venta_anulacion_items o dejaría dos historias contradictorias sobre el mismo venta_item — pido que el ensamblador final corra primero cualquier sección que dependa de tmp_venta_anulada, o mejor, que las tres secciones se escriban con NOT EXISTS mutuos.
- El chequeo 4.8-(4) parcheado (Parte A.3) es un cambio a código YA COMMITEADO de Fase 4 — si otro agente (Comprobantes/Facturación) también está tocando esa misma sección en paralelo, hay riesgo de conflicto de merge sobre las mismas líneas ~1979-1980 del archivo.

### Preguntas abiertas
- El reparto 85% vendible / 5% danada_reparacion / 5% danada_donar / 5% devolver_proveedor es una elección mía razonable pero sin dato real que la respalde (producción tiene 0 anulaciones hoy, no hay muestra que copiar) — ¿Felipe prefiere otra proporción, o directamente 100% vendible para simplificar (ponytail: menos ramas, mismo resultado válido)?
- Los 4 motivos de anulación en tmp_venta_anulada.motivo_anulacion son inventados por mí para variar el texto (mismo estilo que otras fases) — si se prefiere un solo motivo fijo para simplificar el diff, es un cambio de una línea.
- ¿La Fase 6 (stock derivado) va a recalcular stock completo desde movimientos con un solo INSERT..ON CONFLICT al final, o incrementalmente? Si es incremental y ya pasó por 'venta' antes de que Fase 5 inserte 'anulacion_venta', el orden de fases (4→5→6) ya garantiza que Fase 6 vea el movimiento de reingreso — solo lo dejo como confirmación pendiente para quien escriba Fase 6, no bloquea esta receta.

### Receta verificada

RECETA VERIFICADA — Anulaciones (Fase 5, ~50 ventas), sobre `scripts/demo/sembrar-90-dias.sql`

## Helpers reutilizados (ninguno nuevo)
- `pg_temp.h(k)` para toda decisión determinista (selección de candidatas, reparto de condición, lapso de tiempo).
- `pg_temp.sid(t,k)` para todo id nuevo (prefijo 5eed): `pg_temp.sid('mov', 'anulventa:'||venta_item_id)` y `pg_temp.sid('vanu', venta_item_id::text)`.
- `pg_temp.firmante(ubicacion_id, fecha, true, clave)` con `solo_lider=true` (igual que `'cierrecaja:'` o `'pagoA43'`) porque `fn_es_lider()` es el primer guard real de `anular_venta`.

## PARTE A — Parche a la sección FASE 4 ya escrita

### A.1 Nueva tabla temporal (insertar justo antes de "---- 4.7 Comprobantes", después de que `cajas` y `ventas` ya existen en 4.2-4.3)

```sql
-- ---- 4.6bis Candidatas a anulación: ~50 ventas TRU/AQP que un líder anula el mismo día, ANTES de que
-- cierre la caja de esa tienda. Única fuente de verdad de qué tickets son "anulados" en todo el seed —
-- Cambios y Devoluciones deben leer esta tabla (NOT EXISTS) antes de elegir sus propias ~50, para no
-- pisarse (ver riesgos_cruzados).
create temp table tmp_venta_anulada on commit drop as
select v.ticket_id, v.ubicacion_id, v.fecha, v.ts as venta_ts, v.caja_id, c.cerrada_en,
       (case (pg_temp.h('anumotivo:' || v.ticket_id) * 4)::int
          when 0 then 'Cliente se arrepintió antes de salir de tienda'
          when 1 then 'Error de digitación: talla o modelo equivocado en el ticket'
          when 2 then 'Cobro duplicado, se anula y se vuelve a cobrar'
          else 'Cambio de método de pago a último momento' end) as motivo_anulacion,
       v.ts + interval '2 minutes'
         + (pg_temp.h('anulapso:' || v.ticket_id)
            * greatest(extract(epoch from least(c.cerrada_en - v.ts, interval '2 hours')) - 120, 0))
           * interval '1 second' as anulado_en,
       pg_temp.firmante(v.ubicacion_id, v.fecha, true, 'anular:' || v.ticket_id) as anulado_por
from tmp_venta_cab v
join cajas c on c.id = v.caja_id
where v.codigo in ('TRU', 'AQP')
  and pg_temp.h('anular:' || v.ticket_id) < 0.0075          -- ajustar para afinar el ~50 final
  and c.cerrada_en - v.ts >= interval '10 minutes';         -- descarta el ticket si no hay margen ese día

do $$
declare v_n int;
begin
  select count(*) into v_n from tmp_venta_anulada where anulado_por is null;
  if v_n > 0 then raise exception '[check anulaciones] % anulaciones sin firmante líder elegible', v_n; end if;
  select count(*) into v_n from tmp_venta_anulada;
  if v_n < 30 or v_n > 70 then raise exception '[check anulaciones] % candidatas a anulación (se esperaban ~50)', v_n; end if;
end $$;
```

### A.2 Parche al loop 4.7 (agregar 3 columnas al `select` del cursor, envolver 3 columnas del `insert` en `case`, agregar 3 columnas nuevas)

```sql
do $$
declare
  r record; v_serie text; v_numero int; v_tipo text; v_items jsonb; v_sub numeric; v_igv numeric;
  v_doc_tipo text; v_doc_num text; v_doc_nombre text;
begin
  for r in
    select v.ticket_id, v.ubicacion_id, v.ts, v.usuario_id, t.total,
           an.anulado_por, an.anulado_en, an.motivo_anulacion            -- NUEVO
    from tmp_venta_cab v join tmp_ticket_total t on t.ticket_id = v.ticket_id
    left join tmp_venta_anulada an on an.ticket_id = v.ticket_id         -- NUEVO
    where v.codigo in ('TRU', 'AQP')
    order by v.ts, v.ticket_id
  loop
    -- (bloque if/elsif de v_tipo/v_doc_tipo/v_doc_num/v_doc_nombre: SIN CAMBIOS)
    ...
    select serie, numero into v_serie, v_numero from fn_reservar_numero_serie(r.ubicacion_id, v_tipo);  -- SIN CAMBIOS: se reserva igual, esté o no anulada
    v_igv := round(r.total - r.total / 1.18, 2);
    v_sub := round(r.total - v_igv, 2);
    select jsonb_agg(...) into v_items from venta_items vi where vi.venta_id = r.ticket_id;  -- SIN CAMBIOS

    insert into comprobantes (id, venta_id, ubicacion_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc,
      cliente_nombre, moneda, subtotal, igv, total, estado, usuario_id, items, entorno_transmision, respuesta_sunat,
      created_at, enviado_at, motivo_no_emitido, marcado_no_emitido_por, marcado_no_emitido_at)     -- 3 columnas NUEVAS
    values (pg_temp.sid('comp', r.ticket_id::text), r.ticket_id, r.ubicacion_id, v_tipo, v_serie, v_numero, v_doc_tipo,
      v_doc_num, v_doc_nombre, 'PEN', v_sub, v_igv, r.total,
      case when r.anulado_por is not null then 'no_emitido' else 'aceptado' end,                     -- CAMBIADO
      r.usuario_id, v_items, 'sandbox',
      case when r.anulado_por is not null then null else '{"seed": true}'::jsonb end,                -- CAMBIADO (nunca llegó respuesta)
      r.ts,
      case when r.anulado_por is not null then null else r.ts end,                                   -- CAMBIADO (nunca se envió)
      case when r.anulado_por is not null then 'Venta anulada: ' || r.motivo_anulacion end,           -- NUEVO
      r.anulado_por,                                                                                  -- NUEVO
      r.anulado_en);                                                                                  -- NUEVO
  end loop;
end $$;
```

### A.3 Parche obligatorio al chequeo 4.8-(4) (si no, la propia Fase 4 se autodestruye)

```sql
-- ANTES: select count(*) ... estado not in ('aceptado');
-- DESPUÉS:
select count(*) into v_n from comprobantes where id::text like '5eed%' and estado not in ('aceptado', 'no_emitido');
if v_n > 0 then raise exception '[check ventas] % comprobantes sembrados en un estado que no es aceptado o no_emitido', v_n; end if;
select count(*) into v_n from comprobantes where id::text like '5eed%' and estado = 'no_emitido'
  and (motivo_no_emitido is null or marcado_no_emitido_por is null or marcado_no_emitido_at is null);
if v_n > 0 then raise exception '[check ventas] % comprobantes no_emitido sin motivo/firmante/fecha', v_n; end if;
-- el resto de 4.8 (huecos de numeración, % DNI, % factura, etc.) NO necesita cambios: numero se reserva
-- igual para todos, y esos filtros no distinguen estado.
```

## PARTE B — Fase 5: INSERT de `venta_anulacion_items` + UPDATE de `ventas`

Nota importante de corrección: replicar solo esas dos sentencias deja un estado inconsistente si alguna línea queda `condicion='vendible'` (el candado real de `anular_venta` inserta también el `movimiento` de reingreso — sin él, esa mercadería queda descontada del piso para siempre y Fase 6 la va a recalcular mal). La receta completa y correcta es:

```sql
-- ---- 5.x Anulaciones (~50 ventas, ancladas en tmp_venta_anulada de la Fase 4) ----

-- condición de cada línea: 85% vendible (reingresa a stock), 15% repartido entre las 3 no vendibles —
-- reparto propio, no viene de ningún dato real (no hay anulaciones históricas que muestrear: ver
-- preguntas_abiertas). Cambiar aquí si Felipe da otra proporción.
create temp table tmp_anulacion_items on commit drop as
select vi.id as venta_item_id, an.ticket_id, an.anulado_por, an.anulado_en, vi.variante_id,
       m.ubicacion_id, m.sububicacion_id, m.cantidad,
       case when pg_temp.h('anucond:' || vi.id) < 0.85 then 'vendible'
            when pg_temp.h('anucond:' || vi.id) < 0.90 then 'danada_reparacion'
            when pg_temp.h('anucond:' || vi.id) < 0.95 then 'danada_donar'
            else 'devolver_proveedor' end as condicion
from tmp_venta_anulada an
join venta_items vi on vi.venta_id = an.ticket_id
join movimientos m on m.venta_item_id = vi.id and m.tipo = 'salida' and m.motivo = 'venta';  -- la salida original (4.5)

-- movimiento de reingreso — SOLO para condicion='vendible' (igual que el cuerpo real de anular_venta:
-- misma variante_id/ubicacion_id/sububicacion_id que la salida original). No toca `stock`: eso es Fase 6.
insert into movimientos (id, variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id, created_at)
select pg_temp.sid('mov', 'anulventa:' || t.venta_item_id), t.variante_id, t.ubicacion_id, t.sububicacion_id,
       'entrada', t.cantidad, 'anulacion_venta', t.venta_item_id, t.anulado_por, t.anulado_en
from tmp_anulacion_items t
where t.condicion = 'vendible';

-- PEDIDO EXPLÍCITO DEL CONTEXTO — columnas exactas de venta_anulacion_items (id, venta_id, venta_item_id,
-- condicion, movimiento_id, created_at):
insert into venta_anulacion_items (id, venta_id, venta_item_id, condicion, movimiento_id, created_at)
select pg_temp.sid('vanu', t.venta_item_id::text), t.ticket_id, t.venta_item_id, t.condicion,
       case when t.condicion = 'vendible' then pg_temp.sid('mov', 'anulventa:' || t.venta_item_id) end,
       t.anulado_en
from tmp_anulacion_items t;

-- PEDIDO EXPLÍCITO DEL CONTEXTO — ventas.estado='anulada' (satisface el CHECK ventas_anulacion_coherente:
-- anulado_en y motivo_anulacion NOT NULL cuando estado='anulada'):
update ventas v set estado = 'anulada', motivo_anulacion = t.motivo_anulacion,
       anulado_por = t.anulado_por, anulado_en = t.anulado_en
from tmp_venta_anulada t
where v.id = t.ticket_id;

-- chequeo de coherencia con anular_venta real: toda línea de cada venta anulada tiene exactamente 1 fila
do $$
declare v_n int;
begin
  select count(*) into v_n from (
    select an.ticket_id, count(distinct vi.id) as n_items, count(distinct vai.id) as n_anu
    from tmp_venta_anulada an
    join venta_items vi on vi.venta_id = an.ticket_id
    left join venta_anulacion_items vai on vai.venta_item_id = vi.id
    group by an.ticket_id) x
  where x.n_items <> x.n_anu;
  if v_n > 0 then raise exception '[check anulaciones] % ventas anuladas sin una fila de venta_anulacion_items por línea', v_n; end if;
end $$;
```

---

## Conteos + resolución de Cuarentena

### Drift encontrado
- Trigger vivo `conteos_es_prueba_solo_lider` (BEFORE INSERT/UPDATE) exige fn_es_lider() cuando es_prueba=true o cambia — no mencionado en el drift dado, pero irrelevante para esta receta porque D-54 ya manda dejar es_prueba=false en todo el seed (el trigger nunca dispara su excepción en ese caso).
- `conteos.sububicacion_id` es NULLABLE a nivel de esquema (no hay NOT NULL ni CHECK que lo prohíba) — el 'SIEMPRE' del plan es una convención de producto, no un candado de base. Confirmé leyendo juntas `conteo_contar` + `cerrar_conteo` + `fn_aplicar_movimiento` el mecanismo exacto del bug: con sub=NULL, `conteo_contar` suma TODO el stock de la ubicación (bypassea el filtro de sub); al cerrar, el movimiento 'ajuste' se inserta con sub=NULL; `fn_aplicar_movimiento` inserta una fila de stock NUEVA (variante,ubicacion,NULL,0) porque nunca existe una fila real con sub NULL (la app solo opera sobre subs concretas) y sobre esa fila en 0 aplica el ajuste completo — que casi siempre es fuertemente negativo (perdió TODO el stock real disperso en almacén+piso) y revienta 'El ajuste dejaría stock negativo'.
- `retail.stock` tiene `UNIQUE NULLS NOT DISTINCT (variante_id,ubicacion_id,sububicacion_id)` (Postgres 15+): esto confirma que el ON CONFLICT de fn_aplicar_movimiento apunta bien a una fila NULL si existiera — el problema no es un conflicto mal resuelto, es que esa fila NULL simplemente nunca existe en este esquema.
- Producción YA tiene 3 conteos reales: numero 1,2,3, los tres estado='anulado', ubicacion=TRU, fechados 2026-09-16/17. `anular_conteo` solo permite anular un conteo estado='abierto' (nunca cerrado), así que confirmé con `count(*) from movimientos where motivo='conteo'` = 0: estos 3 conteos NUNCA generaron un movimiento de ajuste — cero riesgo de arrastre de stock real. Pero fijan `numero` 1-3 y el sequence en last_value=3/is_called=true: el seed debe arrancar numero en 4, no puede asumir que la tabla está vacía.
- `retail.prendas_danadas` tiene 0 filas en producción ahora mismo (esperado: las ~30 filas que esta receta necesita las siembran Devoluciones y Cambios, que corren antes en la misma transacción — hoy no hay nada que leer en vivo para esa parte).
- `retail.sububicaciones` para 'Taller' tiene 0 filas (confirmado en vivo, coherente con el comentario del propio script 'el Taller no tiene sububicaciones', línea 774-781) — un conteo en Taller solo podría sembrarse con sub=NULL, exactamente el camino peligroso del hallazgo anterior; recomiendo excluir Taller del área de Conteos por completo.
- Leí `pg_get_functiondef` en vivo de `resolver_prenda_danada` y `liquidar_prenda_danada` hoy (2026-09-22): ninguna referencia a `motivo_codigo`, `es_prueba` ni a las columnas nuevas de `comprobantes_cola_de_reintento` (`pendiente_reintento`, `intentos_transmision`, etc.) — confirmado que el drift ya detectado por el arquitecto (crear_devolucion / anular_venta) NO toca esta área, tal como pedía la tarea que verificara.

### Riesgos cruzados con otras áreas
- Cuarentena depende de que Devoluciones y Cambios, al sembrar las ~30 filas de prendas_danadas, también sigan la sub 'cuarentena' de cada tienda en SU PROPIA simulación de stock por bucket (para que el `movimiento_entrada_id` que ellas insertan realmente suba `stock.cantidad` en esa sub). Si no lo hacen, cualquier salida de esta receta (resolver_prenda_danada o liquidar_prenda_danada) revienta con 'Stock insuficiente' al restar de una fila de stock que nunca se cargó. Esto hay que confirmarlo con quien escriba esas dos áreas antes de fijar el SQL final.
- Orden de ejecución dentro de la misma transacción: esta receta necesita que ya existan (a) las prendas_danadas de Devoluciones/Cambios, y (b) las `cajas` de la Fase 4 (para que liquidar_prenda_danada reutilice una caja históricamente abierta en vez de inventar una). Si Fase 5 reordena sub-áreas, Cuarentena debe ir después de esas dos dependencias.
- El `setval('retail.conteos_numero_seq', ...)` que esta receta necesita al final debe ir en SU PROPIO bloque `if current_setting('cayla_seed.definitivo')::boolean then ... end if;`, sin pisar el bloque ya existente que sincroniza `transferencias_numero_seq` (líneas ~2040-2045) — son secuencias distintas pero el patrón de 'solo corre en la corrida definitiva' es compartido y fácil de duplicar mal.
- Los deltas de stock que esta receta aplica (ajustes de conteo, salidas de cuarentena) tienen que insertarse en el punto correcto de la línea de tiempo del bucket compartido que ya vienen simulando las Fases 3/4, para que cualquier sub-área posterior de Fase 5 (gastos/Taller) vea el stock ya corregido, no el de antes del conteo.

### Preguntas abiertas
- ¿Fase 5 tiene su propia noción de escala (como cayla_seed.escala en Fases 2-3) o el volumen de conteos (~25) y prendas en cuarentena (~30) es fijo sin importar ese parámetro? No encontré ninguna referencia a escala fuera de tmp_ventana.n_total — asumí volumen fijo salvo indicación contraria.
- ¿Qué proporción exacta de las ~30 prendas_danadas vienen de Devoluciones (danada_reparacion/danada_donar/devolver_proveedor) vs. Cambios (defecto→no_vendible)? Necesito ese reparto real, no solo el total, para no asignarle a esta receta un estado de resolución (p.ej. devuelta_proveedor) que no case con el origen real de esa fila.
- ¿Debe quedar algún conteo en estado 'abierto' (sin cerrar) al corte, simulando que Felipe todavía no lo cerró? El plan no lo pide explícitamente; por defecto esta receta cierra los 25.

### Receta verificada

ÁREA: conteos_cuarentena — Fase 5, verificado en vivo contra producción (vovjyyiafkxteijimpuy, schema retail) el 2026-09-22.

════════════════════════════════════════════════════════════════
PARTE A — CONTEOS
════════════════════════════════════════════════════════════════

Alcance: SOLO TRU/AQP/LIM, subs 'almacen_tienda' y 'piso_venta' (confirmado que existen 1 de cada por tienda). Taller EXCLUIDO: `retail.sububicaciones` no tiene ninguna fila para Taller (confirmado en vivo), así que un conteo ahí solo podría sembrarse con sub=NULL — exactamente el camino que revienta por stock negativo (ver hallazgo). No hay forma segura de sembrar un conteo de Taller con este esquema; si Felipe quiere cobertura de Taller para Conteos, es un pedido aparte, no algo que esta receta pueda resolver.

Volumen: ~25 conteos, repartidos ~8-9 por tienda, alternando almacen_tienda/piso_venta, en fechas distintas dentro de la ventana. Por sede, las ventanas [created_at, cerrado_en] de los conteos NO deben solaparse (regla de negocio de `abrir_conteo` — "un solo conteo abierto por sede" — no es un constraint de DB, hay que construirla a mano).

numero: EXPLÍCITO, empezando en 4. Producción ya tiene 3 conteos reales (numero 1,2,3, TRU, estado='anulado', fechados 2026-09-16/17 — none con movimiento de ajuste asociado, confirmado `count(*) from movimientos where motivo='conteo'`=0, porque `anular_conteo` solo opera sobre estado='abierto'). El sequence está en last_value=3/is_called=true, así que nextval() ya daría 4 — pero el seed inserta numero a mano (no vía nextval, para que el orden lo controle la receta, igual que hace `transferencias` en la Fase 3) y al final debe correr, DENTRO del bloque `if current_setting('cayla_seed.definitivo')::boolean then`, un `perform setval('retail.conteos_numero_seq', 28, true);` (ajustar 28 al numero real más alto usado) en SU PROPIO bloque, sin tocar el bloque existente de transferencias_numero_seq.

Columnas de `conteos` (imita el INSERT de `abrir_conteo` + el UPDATE final de `cerrar_conteo`, en una sola fila porque el seed no simula el estado intermedio):
- id: pg_temp.sid('conteo', clave)
- ubicacion_id, sububicacion_id: SIEMPRE explícito, nunca NULL (ver hallazgo del bug de sub NULL)
- estado: 'cerrado' para los 25 (no se pide ninguno 'abierto' ni 'anulado' en el plan; si Felipe quiere 1-2 abiertos al corte, es una variante a decidir aparte)
- abierto_por: pg_temp.firmante(ubicacion_id, fecha_apertura::date, false, 'conteo:abrir:'||id) — abrir_conteo solo exige fn_puede_operar_ubicacion, NO líder
- cerrado_por: pg_temp.firmante(ubicacion_id, fecha_cierre::date, true, 'conteo:cerrar:'||id) — cerrar_conteo exige fn_puede_ajustar_inventario() = fn_es_lider() OR fn_es_terminal('administrativa'); este seed no tiene terminal administrativa, así que solo_lider=true
- created_at: momento de apertura (fuera de horario de atención, p.ej. antes de abrir tienda)
- cerrado_en: created_at + 20 a 90 minutos (pg_temp.h para variar)
- alcance: 'todo' (no sembrar 'categoria' salvo pedido explícito — deja alcance_categoria_id NULL, coherente con el CHECK conteos_alcance_categoria_coherente)
- numero: explícito 4..28
- es_prueba: false (default de la tabla — D-54; el trigger `conteos_es_prueba_solo_lider` solo exige líder cuando es_prueba=true, así que en false nunca dispara)

Columnas de `conteo_items` (una fila por variante con `stock.cantidad>0` en esa ubicacion+sub, en el instante histórico — usar el snapshot de tu propia simulación de bucket de Fases 3/4 para ESE día, nunca `retail.stock` en vivo que es el estado de HOY):
- id: pg_temp.sid('conteo_item', conteo_id||':'||variante_id)
- conteo_id, variante_id
- cantidad_sistema: el stock histórico simulado para (variante, ubicacion, sub) en ese instante (integer)
- cantidad_contada: igual a cantidad_sistema en ~96% de las líneas (conteo casi perfecto); en el resto, ±1-3 unidades (pg_temp.h) — salvo en el conteo elegido para A9 (ver abajo)
- diferencia: cantidad_contada − cantidad_sistema, LLENA (no dejar NULL — el NULL en producción es solo el estado transitorio de un conteo aún abierto; el seed imita el resultado final de cerrar_conteo)
- movimiento_id: el id del movimiento 'ajuste' de abajo cuando diferencia<>0; NULL cuando diferencia=0 (igual que hace cerrar_conteo, que solo inserta movimiento si v_dif<>0)
CHECKs a respetar: UNIQUE(conteo_id,variante_id); cantidad_contada>=0.

Movimiento de ajuste (solo líneas con diferencia<>0), imitando el loop de `cerrar_conteo` + `fn_aplicar_movimiento` tipo 'ajuste':
- id: pg_temp.sid('mov','conteo:'||conteo_item_id)
- variante_id: el del conteo_item
- ubicacion_id, sububicacion_id: los del CONTEO (no hay columna de sub en conteo_items — cerrar_conteo literalmente usa c.sububicacion_id)
- tipo='ajuste', cantidad=diferencia (con signo), motivo='conteo', conteo_item_id=id de la línea
- usuario_id: el mismo cerrado_por del conteo
- created_at: cerrado_en del conteo (cerrar_conteo no pasa created_at así que usa el default now(); en el seed HAY que fijarlo a la fecha histórica)
Efecto en stock (fn_aplicar_movimiento, rama 'ajuste'): inserta la fila (variante,ubicacion,sub) si no existe con cantidad=0, luego revisa que v_actual+diferencia>=0 (si no, exception — por eso el sub nunca puede ser NULL en el seed) y hace `stock.cantidad += diferencia`. Aplicar este mismo delta en la simulación de bucket compartida de Fases 3/4 para que el resto de la línea de tiempo quede coherente.

A9 (exactitud <95%): elegir 1 conteo con 15-25 líneas. exactitud = 1 − (Σ|cantidad_contada−cantidad_sistema| / Σ cantidad_sistema). Con Σ cantidad_sistema≈200, forzar Σ|diferencia|>10 concentrando el error en 3-5 líneas (p.ej. -8, -3, -3, +2, +2) en vez de repartirlo parejo entre todas — así se ve como un error real de conteo, no ruido uniforme. Marcar ese conteo con una clave fija (p.ej. pg_temp.sid('conteo','A9')) para poder aislarlo en el chequeo final.

Chequeos finales (mismo formato `if v_n>0 then raise exception` del resto del archivo):
1. `count(*) from conteos where sububicacion_id is null` = 0 (regla propia del seed)
2. Sin solape de ventanas [created_at,cerrado_en] entre dos conteos de la misma ubicacion_id
3. numero sin huecos ni duplicados en 4..28
4. Para cada conteo_items: (diferencia=0) ⟺ (movimiento_id is null) — coherencia 1 a 1
5. Exactamente 1 conteo con exactitud<0.95 (A9)
6. Ningún bucket (variante,ubicacion,sub) queda con stock negativo tras aplicar los ajustes (mismo patrón que "[check abastecimiento] buckets con saldo negativo" de Fase 3)

════════════════════════════════════════════════════════════════
PARTE B — CUARENTENA
════════════════════════════════════════════════════════════════

Confirmado en vivo hoy: `resolver_prenda_danada` y `liquidar_prenda_danada` NO cambiaron — sus `pg_get_functiondef` no mencionan motivo_codigo, es_prueba ni las columnas de comprobantes_cola_de_reintento. El drift #1-3 ya confirmado por el arquitecto NO toca esta área.

Fuente de las ~30 filas de `prendas_danadas`: las siembran Devoluciones (danada_reparacion/danada_donar/devolver_proveedor) y Cambios (motivo defecto→no_vendible), ANTES de que corra esta parte de la receta, en la misma transacción (verificado: hoy `prendas_danadas` tiene 0 filas en producción, como corresponde a un seed que aún no se pegó). Columnas que esta receta necesita LEER de cada fila ya sembrada: `id`, `variante_id`, `ubicacion_id` (para resolver qué sububicacion_id tipo='cuarentena' usar), `cantidad`, `estado` (debe seguir 'en_cuarentena' — CHECK prendas_danadas_resolucion_coherente), `created_at` (para A10 y para que la resolución sea siempre posterior). NO tocar `devolucion_item_id` ni `cambio_id` (exclusión mutua ya fijada por el origen — CHECK prendas_danadas_un_origen).

Reparto sugerido de las ~30 filas (ajustar a la proporción real que dejen Devoluciones+Cambios):
- 3 → A10: created_at ≤ corte−16 días, estado se queda 'en_cuarentena' — NO se les hace ningún INSERT/UPDATE, es la ausencia de resolución lo que construye la anomalía.
- ~9-10 → resolver_prenda_danada('se_boto')
- ~5-6 → resolver_prenda_danada('donada')
- ~4-5 → resolver_prenda_danada('devuelta_proveedor', proveedor_id de un proveedor real ya sembrado en Fase 3, elegido con pg_temp.h)
- ~8-9 → liquidar_prenda_danada (venta con nota fija, sin comprobante)

Imitación de `resolver_prenda_danada` (movimiento primero, luego UPDATE, mismo orden que la función viva):
1. sub_cuarentena = sububicaciones.id where ubicacion_id=pd.ubicacion_id and tipo='cuarentena' (confirmado: existe exactamente 1 por cada TRU/AQP/LIM)
2. INSERT movimientos: variante_id=pd.variante_id, ubicacion_id=pd.ubicacion_id, sububicacion_id=sub_cuarentena, tipo='salida', cantidad=pd.cantidad, motivo='cuarentena_'||estado, usuario_id=firmante líder (pg_temp.firmante(pd.ubicacion_id, fecha, true, clave) — resolver_prenda_danada exige fn_es_lider()), nota=opcional, created_at=fecha de resolución (posterior a pd.created_at). SIN venta_item_id, SIN columna de proveedor en movimientos — el proveedor vive únicamente en prendas_danadas.proveedor_id, confirmado leyendo la función.
3. Efecto en stock (fn_aplicar_movimiento, rama 'salida'): resta pd.cantidad de la fila (variante_id,ubicacion_id,sub_cuarentena) — esa fila debe existir con cantidad>=pd.cantidad porque la puso ahí el movimiento de ENTRADA que insertaron Devoluciones/Cambios; si su simulación de bucket no sigue la sub 'cuarentena', esta salida revienta por "Stock insuficiente" (ver riesgo cruzado).
4. UPDATE prendas_danadas SET estado=<se_boto|donada|devuelta_proveedor>, movimiento_salida_id=<id paso 2>, resuelto_por=<mismo firmante líder>, resuelto_en=<created_at del movimiento>, nota=<misma nota>, proveedor_id=<solo si devuelta_proveedor — el CHECK prendas_danadas_proveedor_coherente exige que sea NULL en cualquier otro estado>.

Imitación de `liquidar_prenda_danada`:
1. Reutilizar una `caja` YA sembrada por la Fase 4 en ubicacion_id=pd.ubicacion_id cuyo rango [abierta_en,cerrada_en] cubra el instante elegido (no crear cajas nuevas). El instante debe ser estrictamente posterior a pd.created_at.
2. precio_unitario: fracción del precio normal de esa variante (30-50% vía pg_temp.h), siempre >0 (constraint del RPC). metodo_pago: uno de efectivo|tarjeta|yape|plin|transferencia (mismo pool que ya usa Fase 4 para pagos).
3. INSERT ventas: id=pg_temp.sid('venta','liq:'||pd.id), ubicacion_id=pd.ubicacion_id, caja_id=<paso 1>, usuario_id=firmante líder (liquidar_prenda_danada exige fn_es_lider()), created_at=<instante>, nota='Liquidación de prenda dañada (cuarentena)'. estado usa el default 'completada' (la función no lo toca).
4. INSERT venta_items: id, venta_id, variante_id=pd.variante_id, cantidad=pd.cantidad, precio_unitario=<paso 2>, costo_unitario=coalesce(variantes.costo,0). descuento_unitario usa su default 0; subtotal/motivo_descuento/motivo_descuento_detalle/argumento_descuento/descuento_etiqueta_id quedan NULL, igual que en la función real.
5. INSERT movimientos: variante_id, ubicacion_id, sububicacion_id=sub_cuarentena, tipo='salida', cantidad=pd.cantidad, motivo='cuarentena_liquidada', venta_item_id=<id paso 4>, usuario_id, created_at=<instante> → mismo efecto en stock que la salida de resolver_prenda_danada (resta de la sub cuarentena).
6. INSERT venta_pagos: venta_id, metodo=<paso 2>, monto=precio_unitario*pd.cantidad, recibido=NULL o =monto si metodo='efectivo' (mismo patrón que ya usa Fase 4).
7. UPDATE prendas_danadas SET estado='liquidada', movimiento_salida_id=<id paso 5>, resuelto_por=firmante líder, resuelto_en=<instante>, nota=opcional. proveedor_id queda NULL (el CHECK prendas_danadas_proveedor_coherente lo exige para cualquier estado que no sea 'devuelta_proveedor').
8. NO se inserta nada en `comprobantes` — confirmado, ninguna de las dos funciones lo toca ("sin comprobante" del plan queda confirmado línea por línea).

Chequeos finales de Cuarentena:
1. Exactamente 3 filas con estado='en_cuarentena' y (corte − created_at) > interval '15 days', dentro del subconjunto sembrado por Devoluciones+Cambios (A10)
2. Toda prenda con estado<>'en_cuarentena' tiene movimiento_salida_id y resuelto_en no nulos (redundante con el CHECK vivo, pero conviene verificarlo desde el seed)
3. Ningún bucket de stock queda negativo tras las salidas de cuarentena (mismo patrón de Fase 3)
4. Toda liquidación referencia una caja_id cuyo rango [abierta_en,cerrada_en] cubre su created_at
5. Ninguna resuelto_en es anterior al created_at de esa misma fila de prendas_danadas

════════════════════════════════════════════════════════════════
REUSO DE HELPERS (obligatorio, no inventar otros)
════════════════════════════════════════════════════════════════
- pg_temp.h(clave): TODA variación (qué línea tiene diferencia, cuánto, qué prenda se liquida vs se bota, qué método de pago, qué proveedor) sale de esta función con una clave textual única y estable por fila — nunca random().
- pg_temp.sid(tabla,clave): TODO id (conteos, conteo_items, movimientos, prendas_danadas ya vienen con su propio id de otra área, ventas/venta_items/venta_pagos de liquidación) sale de aquí, con clave descriptiva (p.ej. 'conteo:'||n, 'conteo_item:'||conteo_id||':'||variante_id, 'mov:conteo:'||item_id, 'venta:liq:'||pd.id).
- pg_temp.firmante(ubicacion_id, fecha, solo_lider, clave): abrir_conteo → solo_lider=false; cerrar_conteo, resolver_prenda_danada, liquidar_prenda_danada → solo_lider=true (las tres exigen fn_es_lider()/fn_puede_ajustar_inventario() en la función viva). Usar una clave por acción+fila para no repetir siempre el mismo firmante.

---

## Gastos + Proformas

### Drift encontrado
- registrar_gasto no exige fn_es_lider() directamente sino fn_puede_registrar_compras(), que HOY (verificado en vivo) es literalmente `select fn_es_lider();` — delegación 1:1. Confirmado además que la migración de hoy `alta_colaborador_requiere_aprobacion` NO tocó fn_es_lider(): su definición viva sigue siendo solo `p.estado='activo' and c.rol='lider' and c.estado='activo'`, sin condición nueva de aprobación.
- fn_es_lider() no filtra por ubicación — un líder de CUALQUIER sede puede registrar un gasto en CUALQUIER ubicacion_id. Para el firmante del seed: pg_temp.firmante(null, fecha, true, clave), sin atarlo a la ubicación del gasto (mismo patrón que ya usa la Fase 3 para 'compras, pagos y notas de crédito: solo líder').
- Ninguna de las 3 tablas del área (gastos, caja_movimientos, proformas) tiene columna es_prueba — D-54 NO aplica aquí, a diferencia de productos/ventas/cajas/conteos.
- gastos.token_cliente tiene un UNIQUE real (índice gastos_token_cliente_key, no solo la mención en el código) — dejarlo NULL en cada fila sembrada.
- Verificado con pg_trigger: NINGUNA de las 3 tablas tiene triggers. El INSERT directo solo necesita imitar lo que el CUERPO de cada RPC hace, sin side-effects ocultos.
- gastos y caja_movimientos NO tienen columna de fecha separada de created_at — created_at ES la única fecha (default now(), pero no generated: el seed puede fijarla a mano, igual que en el resto del archivo).
- Confirmado leyendo el propio sembrar-90-dias.sql (no los docs): la Fase 4 NO inserta ninguna fila en caja_movimientos (grep sin resultados) — el comentario de línea 1831 ('todavía no hay ingresos/egresos ni cambios: eso es la Fase 5') es literal. Los ~120 gastos y sus egresos son 100% de esta fase, sin riesgo de duplicar nada que la Fase 4 ya haya escrito.
- Existe una fórmula de 'efectivo teórico de LA SEDE' completamente distinta (apps/web/lib/finanzas-nucleo.ts, documentada como hueco conocido en docs/datos/modulos/11-finanzas-operativas.md:62-74) que SÍ es un query en vivo sobre gastos+ventas (no un snapshot) y se recalcula sola sin que el seed tenga que hacer nada — pero confirma que hay DOS conceptos distintos de 'efectivo teórico' (el de la sede vs. el de cerrar_caja() por caja) y no hay que confundirlos al razonar sobre consistencia.
- Para proformas convertidas, la numeración de comprobantes debe usar fn_reservar_numero_serie() EN VIVO (llamada real, no imitada) dentro de la misma transacción — es exactamente el patrón que la propia Fase 4 ya usa en su sección 4.7 (confirmado leyendo esa sección): avanza series_comprobantes.siguiente_numero, una fila normal, sin gap que sincronizar después.

### Riesgos cruzados con otras áreas
- RIESGO GRANDE confirmado en el propio archivo: el chequeo (7) de la Fase 4 (línea ~2008-2012) congela `cajas.monto_cierre_sistema = monto_apertura + ventas_efectivo` en el instante en que corre, ANTES de que exista ningún caja_movimientos/devolución/cambio (comentario línea 1831 lo dice explícito). Esa es la misma fórmula (incompleta en ese punto) que cerrar_caja() en vivo, verificada completa: apertura + ventas_efectivo + ingresos - egresos - reembolsos_efectivo + cambios_efectivo. Si la Fase 5 inserta egresos de gasto contra una caja YA CERRADA por la Fase 4 sin ajustar `cajas`, queda un estado inconsistente (principio 2 de CLAUDE.md): apps/web/lib/caja.ts:getMovimientosCaja lista en vivo los caja_movimientos de una caja cerrada, así que el detalle mostraría el egreso del gasto mientras la cabecera (getHistorialCierres, que lee cajas.diferencia tal cual quedó guardada, sin recalcular) seguiría mostrando la diferencia vieja. Arreglo mínimo verificado: por cada caja tocada por un egreso de gasto, restar la MISMA cantidad de monto_cierre_sistema Y de monto_cierre_real (deja diferencia intacta, tanto en las cajas normales como en las 2 cajas A1 con faltante/sobrante forzado).
- Ese mismo riesgo es COMPARTIDO con postventa (devoluciones/cambios), que va a tocar las MISMAS cajas cerradas por el mismo motivo (reembolso_monto de devoluciones aprobadas y cambios.diferencia en efectivo también entran en la fórmula de cerrar_caja()). Si cada área corre su propio UPDATE sobre `cajas` por separado, hay riesgo de pisarse o de doble resta — recomiendo un solo UPDATE final, agrupado por caja_id, que sume gastos+reembolsos+cambios juntos, después de que las tres áreas hayan insertado sus filas. No lo resuelvo acá porque devoluciones/cambios no son mi área.
- El Taller no tiene NINGUNA caja (la Fase 4 solo abre cajas para TRU/AQP/LIM — confirmado en la sección 4.2). Un gasto del Taller en efectivo nunca debe buscar caja: la propia RPC ya lo tolera con gracia (`if v_caja_id is not null`), pero si la parte de Taller de la Fase 5 llega a asumir que existe una caja ahí, rompería el FK caja_movimientos.caja_id -> cajas.
- LIM no tiene serie de comprobantes registrada (mismo hallazgo que ya usa el propio chequeo (5) de la Fase 4) — cualquier intento de convertir una proforma de LIM fallaría al llamar fn_reservar_numero_serie(); mi receta restringe la conversión a TRU/AQP únicamente.

### Preguntas abiertas
- ¿Confirma Felipe el criterio de ajuste de cajas.monto_cierre_sistema/monto_cierre_real (restar de ambos, preservando diferencia) propuesto para cuadrar con cerrar_caja(), o prefiere dejar ese hueco documentado como conocido ya que ninguna pantalla recalcula en vivo una caja cerrada?
- ¿Quién coordina el UPDATE final consolidado sobre `cajas` entre mi área (gastos) y postventa (devoluciones/cambios), para no pisarse o restar dos veces sobre la misma caja?
- No revisé RegistrarGastoModal.tsx (fuera del presupuesto de esta verificación) — ¿existe ya una lista real de categorías de gasto en la UI que el seed debería reusar en vez de inventar categorías nuevas?

### Receta verificada

# Receta verificada — Gastos y Proformas (Fase 5), 2026-09-22

Verificado en vivo contra project_id `vovjyyiafkxteijimpuy`, schema `retail` (execute_sql, solo SELECT). Todas las citas de código son de `pg_get_functiondef`/`information_schema`/`pg_constraint`/`pg_trigger`/`pg_indexes` leídos hoy, y de `scripts/demo/sembrar-90-dias.sql` en este working directory.

## 0. Esquema vivo exacto

**retail.gastos** (0 filas hoy, sin triggers):
id uuid pk default gen_random_uuid(), ubicacion_id uuid NOT NULL fk ubicaciones, categoria text NOT NULL (libre, sin CHECK de lista), proveedor_id uuid NULL fk proveedores, documento_tipo text NOT NULL default 'sin_documento' CHECK in (factura,boleta,sin_documento), documento_serie text NULL, documento_numero text NULL, subtotal numeric NOT NULL default 0 CHECK >=0, igv numeric NOT NULL default 0 CHECK >=0, total numeric NOT NULL CHECK >0 y CHECK total=subtotal+igv, metodo_pago text NOT NULL CHECK in (efectivo,transferencia,yape,plin,deposito,tarjeta,otro), especificacion text NULL, usuario_id uuid NULL fk personas, created_at timestamptz NOT NULL default now() (única fecha — no hay columna "fecha" aparte, y no es generated: se puede fijar a mano), token_cliente uuid NULL **con UNIQUE real** (`gastos_token_cliente_key`) — dejar siempre NULL en el seed. CHECK extra `gastos_igv_requiere_factura`: igv=0 salvo documento_tipo='factura'. Sin `es_prueba`.

**retail.caja_movimientos** (4 filas hoy — no vacía, pero ninguna con id like '5eed%'; sin triggers):
id pk, caja_id uuid NOT NULL fk cajas, tipo text NOT NULL CHECK in (ingreso,egreso), monto numeric NOT NULL CHECK >0, motivo text NOT NULL, usuario_id uuid NULL fk personas, created_at timestamptz NOT NULL default now(), nota text NULL, es_ajuste boolean NOT NULL default false. Sin `es_prueba`.

**retail.proformas** (1 fila hoy, sin triggers):
id pk, ubicacion_id uuid NOT NULL fk ubicaciones, cliente_nombre/cliente_num_doc text NULL, items jsonb NOT NULL, subtotal/igv numeric NOT NULL default 0, total numeric NOT NULL CHECK >0, estado text NOT NULL default 'vigente' CHECK in (vigente,convertida,vencida,anulada), comprobante_id uuid NULL fk comprobantes, usuario_id uuid NULL fk personas, created_at timestamptz NOT NULL default now(), vence_at timestamptz NULL. Sin `es_prueba`.

## 1. registrar_gasto — permiso y firmante

Exige `fn_puede_registrar_compras()` = HOY literalmente `select fn_es_lider();` (sin condición de aprobación nueva pese a la migración de hoy `alta_colaborador_requiere_aprobacion`). `fn_es_lider()` NO valida ubicación. Firmante: `pg_temp.firmante(null, fecha, true, 'gasto:'||clave)` — SIEMPRE líder, cualquier sede.

Validaciones que el INSERT debe respetar a mano (las hace la RPC): `p_total > 0`; `0 <= igv <= total`; `total = subtotal+igv` con `subtotal = total - igv`.

## 2. El egreso de caja que dispara registrar_gasto

Solo si `metodo_pago='efectivo'` Y hay una caja `estado='abierta'` en esa `ubicacion_id` EN ESE INSTANTE — no hay `caja_id` en `gastos`, el vínculo es solo temporal. Para el seed: el `created_at` del gasto debe caer dentro de `[abierta_en, cerrada_en)` de la caja `pg_temp.sid('caja', codigo||':'||fecha)` que la Fase 4 sembró para esa ubicación+fecha (TRU/AQP/LIM únicamente — el Taller nunca tiene caja, la Fase 4 solo abre las 3 tiendas). Si el Taller genera un gasto en efectivo, simplemente no hay caja que tocar (igual que haría la RPC real: `if v_caja_id is not null`).

INSERT en caja_movimientos: `(caja_id, tipo='egreso', monto=total, motivo='Gasto: '||categoria, usuario_id=firmante, created_at=<mismo instante del gasto>)` — la RPC no fija `created_at` (usa default now()), así que el seed debe hacerlo a mano.

## 3. Riesgo cruzado y su arreglo (ver riesgos_cruzados para el detalle completo)

Después de insertar los egresos de gasto, por cada caja tocada:
```sql
update cajas c set
  monto_cierre_sistema = monto_cierre_sistema - g.total_efectivo,
  monto_cierre_real    = monto_cierre_real    - g.total_efectivo
from (select caja_id, sum(monto) as total_efectivo from caja_movimientos
      where tipo='egreso' and motivo like 'Gasto:%' and caja_id::text is not null
      group by caja_id) g
where c.id = g.caja_id and c.id::text like '5eed%';
```
Restar lo mismo de ambos campos deja `diferencia` intacta. **Coordinar con postventa** antes de correrlo: si devoluciones/cambios también ajustan `cajas`, debe ser un solo UPDATE consolidado (gastos + reembolsos + cambios sumados por caja), no tres pasadas independientes.

## 4. Volumen (~120 gastos)

Repartir por ubicación (TRU/AQP/LIM/Taller) y categoría libre (revisar antes categorías reales de RegistrarGastoModal.tsx — no verificado en esta pasada). metodo_pago: mayoría efectivo pero no exclusivo (para ejercitar ambas ramas de la RPC). documento_tipo: mayoría boleta/sin_documento, minoría factura con igv>0 (recordando el CHECK igv=0 salvo factura).

## 5. Proformas (~10) — SÍ incluir, es barato y ya verificado

`crear_proforma` exige `fn_puede_operar_ubicacion` (líder O persona de esa sede — no exclusivo a líder) y `subtotal+igv=total` redondeado a 2 decimales. Firmante: `pg_temp.firmante(ubicacion_id, fecha, false, clave)`. INSERT: `(ubicacion_id, items, subtotal, igv, total, cliente_nombre, cliente_num_doc, usuario_id, vence_at, created_at=fecha histórica)`, estado default 'vigente'.

- 8 `vigente` con `vence_at` futuro (respecto al corte de la ventana) — nunca `vigente` con `vence_at` ya pasado: ningún RPC ni cron la vencería, sería un estado que la base real nunca produce sola.
- 2 `convertida`, restringidas a **TRU o AQP** (LIM no tiene serie de comprobantes — mismo hallazgo que ya usa el chequeo (5) de la Fase 4, y confirmado también porque `emitir_comprobante` siempre llama a `fn_reservar_numero_serie` sin excepción por tipo):
  1. `select serie, numero from fn_reservar_numero_serie(p_ubicacion_id, p_tipo)` — llamada REAL en vivo (mismo patrón que la Fase 4 usa en 4.7), no imitada: avanza `series_comprobantes.siguiente_numero`, una fila normal sin gap que sincronizar después.
  2. INSERT en comprobantes: `(venta_id=NULL, ubicacion_id, tipo, serie, numero, cliente_tipo_doc='sin_documento', cliente_num_doc, cliente_nombre, subtotal, igv, total, usuario_id, items=proforma.items, estado='pendiente', created_at=fecha histórica)`. `venta_id` NULL a propósito (no hay venta real que la originó).
  3. UPDATE proformas set estado='convertida', comprobante_id=<el id insertado>.
- Nunca `vencida` ni `anulada`: ningún RPC en la lista viva las produce.

## 6. Chequeo final (mismo formato que el resto del archivo)

```sql
do $$
declare v_n int;
begin
  select count(*) into v_n from gastos where id::text like '5eed%' and total <> subtotal + igv;
  if v_n > 0 then raise exception '[check gastos] % gastos con total mal cuadrado', v_n; end if;

  select count(*) into v_n from caja_movimientos m where m.id::text like '5eed%' and m.motivo like 'Gasto:%'
    and not exists (select 1 from cajas c where c.id = m.caja_id and m.created_at >= c.abierta_en and m.created_at < c.cerrada_en);
  if v_n > 0 then raise exception '[check gastos] % egresos de gasto fuera de la ventana de su caja', v_n; end if;

  select count(*) into v_n from gastos g where g.id::text like '5eed%'
    and not exists (select 1 from colaboradores k where k.persona_id = g.usuario_id and k.rol = 'lider');
  if v_n > 0 then raise exception '[check gastos] % gastos que no firmó un líder', v_n; end if;

  -- requiere que el UPDATE de cajas (sección 3, consolidado con postventa) ya haya corrido
  select count(*) into v_n from cajas c where c.id::text like '5eed%'
    and c.monto_cierre_sistema <> c.monto_apertura
      + coalesce((select sum(p.monto) from venta_pagos p join ventas v on v.id = p.venta_id where v.caja_id = c.id and p.metodo = 'efectivo'), 0)
      - coalesce((select sum(m.monto) from caja_movimientos m where m.caja_id = c.id and m.tipo = 'egreso'), 0)
      + coalesce((select sum(m.monto) from caja_movimientos m where m.caja_id = c.id and m.tipo = 'ingreso'), 0);
  if v_n > 0 then raise exception '[check gastos] % cajas cuyo cierre no cuadra tras sumar los egresos/ingresos', v_n; end if;

  select count(*) into v_n from proformas where id::text like '5eed%' and round(subtotal + igv, 2) <> round(total, 2);
  if v_n > 0 then raise exception '[check proformas] % proformas con total mal cuadrado', v_n; end if;
  select count(*) into v_n from proformas where id::text like '5eed%' and estado = 'vigente' and vence_at <= now();
  if v_n > 0 then raise exception '[check proformas] % proformas vigentes ya vencidas', v_n; end if;
  select count(*) into v_n from proformas where id::text like '5eed%' and estado = 'convertida' and comprobante_id is null;
  if v_n > 0 then raise exception '[check proformas] % proformas convertidas sin comprobante', v_n; end if;
end $$;
```

---

## Producción del Taller — infraestructura (proveedores, insumos, lotes)

### Drift encontrado
- El plan dice 'el generador ya tiene un patrón para generar RUC válido de 11 dígitos en la sección de Compras de la Fase 3, reutilízalo' — ESTO ES IMPRECISO. Confirmado por Grep sobre scripts/demo/sembrar-90-dias.sql: la Fase 3 (Compras, líneas ~857-904) NO genera RUCs nuevos, solo LEE `pr.ruc`/`tiene_ruc` de `retail.proveedores` ya existentes en producción. El único patrón de 11 dígitos ('20' || lpad((100000+g)::text, 9, '0')) vive en scripts/demo/local/fixtures-produccion-simulada.sql línea 69, que es un fixture SOLO-LOCAL para ensayar contra Postgres de Docker (nunca corre contra producción) — no es 'la sección de Compras de la Fase 3' del generador real. El único generador de número-documento que SÍ vive dentro de sembrar-90-dias.sql es la Fase 4 (comprobantes de venta, línea 1915): '20' || lpad((abs(hashtext(r.ticket_id::text)) % 100000000)::text, 8, '0') — eso da 2+8=10 dígitos, NO 11, y es para el RUC del CLIENTE en una factura de venta, no para un proveedor. Reutilizado tal cual, ese patrón de Fase 4 violaría el CHECK proveedores_produccion_ruc_check ('^[0-9]{11}$', confirmado en vivo). La receta de abajo adapta la FORMA del fixture local (prefijo '20' + 9 dígitos = 11) pero generado con pg_temp.h() para mantener el determinismo por semilla en vez de un contador plano.
- Confirmado en vivo (pg_constraint + information_schema, 2026-09-22): el esquema de las 4 tablas coincide con el plan en columnas y candados, PERO el plan no mencionaba varios CHECK adicionales que si importan para la receta: proveedores_produccion_billetera_coherente (celular_billetera y billeteras deben ser ambos NULL o ambos no-NULL), proveedores_produccion_cci_check (^[0-9]{20}$), proveedores_produccion_celular_billetera_check (^9[0-9]{8}$), movimientos_insumo_lote_obligatorio (insumo_lote_id NOT NULL salvo tipo='ajuste' — para 'compra' es obligatorio), movimientos_insumo_produccion_segun_tipo (produccion_id debe ser NULL para tipo='compra'), movimientos_insumo_cantidad_segun_tipo (cantidad > 0 para 'compra'). Ninguno rompe la receta si se respetan (ver receta), pero el plan original no los listaba explícitamente.
- El plan no advertía que `producciones` (la tabla que usará el otro agente 'Producción del Taller — órdenes') NO tiene ninguna tabla de receta/BOM que ligue insumo→cantidad por unidad producida (columnas confirmadas en vivo: solo costo_tela/costo_avios/costo_maquila en soles, cantidad_plan/cantidad_buenas en unidades de PRODUCTO, sin línea de insumos). El consumo de insumos por OP se registrará ad hoc vía movimientos_insumo (tipo='consumo', produccion_id NOT NULL), no hay forma de calcular desde el esquema cuánto insumo exacto necesitan las ~30 OP. Esto es una limitación real del modelo de datos, no un error mío — lo marco como riesgo cruzado abajo.

### Riesgos cruzados con otras áreas
- Sin tabla de receta/BOM, el volumen de insumo_lotes que yo siembre es una ESTIMACIÓN con margen, no un cálculo exacto: si el otro agente ('Producción del Taller — órdenes') consume más de lo que dejo en insumo_lotes, algún movimientos_insumo tipo='consumo' de su lado podría dejar `retail.v_insumo_saldos.fisico` negativo para algún insumo. Como las dos mitades de Fase 5-Producción terminan en LA MISMA transacción (todo el generador es una sola transacción, según el encabezado del archivo), recomiendo agregar — cuando se junten ambas recetas — un chequeo final estilo Fase 3 check(1): `select insumo_id, ubicacion_id from retail.v_insumo_saldos where fisico < 0` debe devolver 0 filas, con RAISE EXCEPTION si falla. Yo no puedo escribir ese chequeo solo porque depende de que el otro agente ya haya insertado sus 'consumo' antes de evaluarlo.
- insumo_lotes.ubicacion_id es NOT NULL y apunta a retail.ubicaciones — hay que decidir a qué ubicación entra cada lote de insumos (probablemente 'Taller', la única ubicación de producción). Confirmar con el agente de órdenes que todas sus producciones también usan la ubicación 'Taller' para que los saldos de v_insumo_saldos coincidan en el mismo bucket (insumo_id, ubicacion_id).
- insumo_lotes.recepcion_id y comprobante_item_id son nullable y apuntan a comprobantes_produccion_recepciones/comprobantes_produccion_items — mi receta los deja en NULL (compra directa por INSERT, sin pasar por el flujo de comprobante_produccion, igual que el resto del generador no usa los RPC reales). Si el agente de Facturación/Compras del Taller (fuera de mi área) asume que TODO insumo_lote sembrado en Fase 5 tiene un comprobante_produccion asociado, avisar — mi receta no lo genera porque no fue pedido para 'produccion_infra'.

### Preguntas abiertas
- ¿Cuánto consume realmente cada OP de un insumo típico (metros de tela, unidades de avío)? Sin tabla de receta/BOM no puedo derivarlo del esquema; le pedí holgura al volumen pero conviene que el agente de 'Producción del Taller — órdenes' confirme si mis cantidades por lote (150-400 m de tela, 500-3000 u de avíos) alcanzan sus ~30 OP antes de pegar el SQL final.
- ¿A qué ubicación(es) entran los insumo_lotes — solo 'Taller', o también almacenes de tienda si alguna maquila se recibe en tienda? Mi receta asume solo 'Taller'.

### Receta verificada


# Receta verificada en vivo — Fase 5 / Producción (infraestructura: proveedores_produccion, insumos, insumo_lotes, movimientos_insumo)
Verificado contra producción (proyecto vovjyyiafkxteijimpuy, schema retail) el 2026-09-22 vía pg_constraint/pg_trigger/pg_policies/information_schema. Las 4 tablas están en 0 filas hoy (igual que `producciones` y `cotizaciones_maquila`, que NO se siembran en esta receta).

## 0. Namespaces nuevos para los helpers existentes (evitar colisión con Fase 3/4)
Reutilizar `pg_temp.h(k)` y `pg_temp.sid(t,k)` tal cual están definidas (líneas 443 y 767 de sembrar-90-dias.sql) — NO redefinir. Para `pg_temp.sid(t,k)` usar strings de tabla (`t`) que NO están ya tomados por Fase 3/4, para blindarse ante cualquier colisión de `k`:
- `pg_temp.sid('provprod', clave)` → proveedores_produccion.id
- `pg_temp.sid('insumo', clave)` → insumos.id
- `pg_temp.sid('inslote', clave)` → insumo_lotes.id  (OJO: no usar el string 'lote', que Fase 3 ya usa en la línea 1389 para `lotes` de comprobantes de compra retail — mismo helper, mismo `t`, distinto negocio; usar 'inslote' evita cualquier ambigüedad aunque técnicamente son PKs de tablas distintas)
- `pg_temp.sid('movins', clave)` → movimientos_insumo.id  (mismo razonamiento: Fase 3/4 usan 'mov' para `movimientos` de stock retail)

## 1. proveedores_produccion — ~8 filas
Columnas confirmadas (NOT NULL en negrita): **id** uuid default gen_random_uuid(), **nombre** text (CHECK largo>0), **rubro** text (CHECK IN tela|avios|maquila|otro), ruc text nullable (CHECK `^[0-9]{11}$`, UNIQUE parcial donde no-NULL), contacto, telefono, plazo_credito_dias int (CHECK >0 si no-NULL), forma_pago_preferida (CHECK IN transferencia|yape|plin|efectivo|deposito|otro), banco, cuenta_bancaria, cci (CHECK `^[0-9]{20}$`), celular_billetera (CHECK `^9[0-9]{8}$`), billeteras text[] (CHECK 1-2 elementos, subconjunto de {yape,plin}), titular_cuenta (CHECK 2-120 chars), **activo** boolean default true, **created_at** default now().
CHECK cruzado a respetar: `celular_billetera IS NULL = billeteras IS NULL` (o pones ambos o ninguno).
No hay trigger en esta tabla. RLS: solo SELECT para líder (`proveedores_produccion_select_lider`); toda escritura real de UI pasa por `guardar_proveedor_produccion()` — pero el generador, como en el resto del archivo, inserta directo (bypassa RLS por rol de ejecución), así que no hace falta llamar al RPC.

RUC: generar 6-7 de los 8 con RUC (dejar 1-2 sin RUC, como pasa con proveedores reales — el propio patrón de Compras trata "sin RUC" como caso normal, no error). Patrón determinista, mismo estilo que el resto del archivo:
```sql
'20' || lpad((100000 + floor(pg_temp.h('ruc:provprod:' || g) * 899999))::int::text, 9, '0')
```
(11 dígitos exactos: '20' + 9. Es solo una CHECK de formato regex, no hay dígito verificador real que validar — confirmado, no hay función de checksum en las migraciones).
CCI (cuando aplique, 1-2 proveedores con cuenta bancaria completa): 20 dígitos, mismo patrón `lpad(..., 20, '0')`. Yape/Plin: celular `'9' || lpad(...,8,'0')` + billeteras `array['yape']` o `array['yape','plin']`, manteniendo coherente con el CHECK cruzado.
rubro: repartir entre tela/avios/maquila/otro según a qué le venden — para que calcen con `insumos.tipo` de abajo (proveedores de tela → tipo='tela' en insumos que les compre; avíos → tipo='avio').

## 2. insumos — ~12 filas
Columnas: **id**, **codigo** text UNIQUE, **nombre**, **tipo** (CHECK IN tela|avio), **unidad_medida** (CHECK IN metro|unidad|kilo|cono|par|docena), proveedor_id nullable FK→proveedores_produccion(id) (confirmado en vivo: la FK apunta al directorio NUEVO, migración 20260920110000 aplicada — insumos e insumo_lotes están en 0 filas hoy, exactamente como decía el plan), **merma_pct** numeric default 0 (CHECK 0<=x<0.5, dejar en 0 o un valor chico realista tipo 0.03-0.08 para telas), stock_minimo nullable (CHECK >=0), archivado_at, nota, **created_at**/**updated_at** default now(). Trigger `insumos_set_updated_at` (BEFORE UPDATE) — no afecta un INSERT limpio.
Mezcla sugerida: 6 tela (unidad_medida='metro', proveedor_id de un proveedor rubro='tela') + 6 avio (unidad_medida IN unidad|par|docena|cono, proveedor_id de un proveedor rubro='avios'). codigo con convención simple tipo `'TEL-01'..'TEL-06'`, `'AVI-01'..'AVI-06'`.

## 3. insumo_lotes — ~30-36 filas (3 lotes por insumo)
Columnas: **id**, **insumo_id** FK→insumos, **ubicacion_id** FK→ubicaciones (usar la ubicación 'Taller'), codigo_lote nullable (UNIQUE parcial por (insumo_id,codigo_lote) si no-NULL — o se deja NULL y no aplica), proveedor_id nullable FK→proveedores_produccion (mismo proveedor que quedó en `insumos.proveedor_id` para ese insumo, coherencia), **cantidad_ingresada** numeric (CHECK >0), **costo_unitario** numeric (CHECK >=0), documento nullable, **fecha_ingreso** date default CURRENT_DATE — **hay que fijarlo explícito a una fecha dentro de la ventana [cayla_seed.inicio, cayla_seed.fin]**, el default no sirve para sembrado histórico, **origen** default 'compra' (CHECK IN compra|saldo_inicial — usar 'compra' para todos salvo, opcionalmente, 1 'saldo_inicial' al día de inicio de ventana si se quiere modelar stock heredado), nota, **created_at** default now() (fijar también explícito, no dejar en `now()` real). recepcion_id/comprobante_item_id: dejar NULL (fuera de alcance de esta receta — ver riesgo cruzado).
Reparto en el tiempo: 3 lotes por insumo, espaciados con `pg_temp.h('lote:'||insumo_id||':'||n)` sobre los 90 días, igual que el patrón de "regulares con RUC" de Fase 3.
Cantidad por lote (holgura para ~30 OP, sin BOM real — ver pregunta abierta): telas 150-400 metros; avíos 500-3000 unidades/pares/docenas/conos según el insumo. costo_unitario con valores PEN realistas (telas ~S/8-25/metro, avíos ~S/0.05-2/unidad).

## 4. movimientos_insumo — 1 fila por lote (tipo='compra')
Columnas: **id**, **insumo_id** FK, insumo_lote_id FK (**obligatorio si tipo≠'ajuste'** — CHECK movimientos_insumo_lote_obligatorio confirmado en vivo), **ubicacion_id** FK (mismo valor que el lote), **tipo** (CHECK IN compra|consumo|devolucion|merma|ajuste — usar 'compra'), **cantidad** numeric (CHECK: tipo≠'ajuste' ⇒ cantidad>0 — igual a `insumo_lotes.cantidad_ingresada` del lote que referencia), **costo_unitario** default 0 (CHECK >=0 — igual al costo_unitario del lote), produccion_id nullable (**CHECK movimientos_insumo_produccion_segun_tipo: para tipo IN (compra,merma,ajuste) DEBE ser NULL** — confirmado en vivo, no poner nada aquí), usuario_id nullable FK→personas, motivo nullable (**obligatorio y no-vacío solo si tipo='ajuste'** — no aplica aquí), nota, **created_at** default now() — fijar explícito.
usuario_id: usar `pg_temp.firmante(null, l.fecha_ingreso, true, 'compra_insumo:' || l.id)` (solo_lider=true), igual convención que Compras retail en Fase 3 ("Compras, pagos y notas de crédito: solo líder").
created_at: mismo patrón hora-laboral 09:00-17:00 de Fase 3 (ej. línea 918), sobre `l.fecha_ingreso`.

## 5. Chequeo de cierre de esta sub-sección (estilo Fase 3, líneas ~1582-1611)
```sql
do $$
declare v_n int;
begin
  -- ids sembrados por esta receta llevan 5eed% vía pg_temp.sid, igual que el resto del archivo
  select count(*) into v_n from retail.proveedores_produccion where id::text like '5eed%' and ruc is not null
    group by ruc having count(*) > 1;  -- defensivo: el índice único ya lo impediría al insertar
  -- el chequeo de verdad que importa (saldo físico no negativo) solo se puede correr DESPUÉS
  -- de que el agente de 'Producción del Taller — órdenes' inserte sus movimientos tipo='consumo'
  -- en la misma transacción — ver riesgos_cruzados.
end $$;
```


---

## Producción del Taller — órdenes (OP), consumos y cierre

### Drift encontrado
- `fn_recalcular_costo_insumos_produccion(p_produccion_id uuid)` SÍ existe en producción (confirmado leyendo pg_proc y pg_get_functiondef) — coincide con el nombre que trae el plan original, así que ESA parte del plan no envejeció.
- Pero el documento de arquitectura del módulo (docs/datos/modulos/10-produccion-del-taller.md, 'última revisión 2026-09-22') dice que `registrar_consumo_insumo` está 'solo local — pendiente en producción': ESO SÍ ESTÁ DESACTUALIZADO. `registrar_consumo_insumo` ya existe en producción (mismo pg_proc), y con ella el resto de la cadena de insumos completa. No confiar en ese punto específico del doc aunque diga revisado hoy.
- El plan original dice 'comprobantes_produccion (+ _items, _pagos) no tiene FK a los lotes: mantener documento = serie-número a mano' — FALSO en el esquema vivo. `insumo_lotes.comprobante_item_id` y `insumo_lotes.recepcion_id` son FK reales a `comprobantes_produccion_items` y `comprobantes_produccion_recepciones`. Los ~12 comprobantes de producción no son solo asientos de AP sueltos: para los ítems con insumo_id, SON la fuente de los lotes que las OP consumen por FIFO — hay que sembrar comprobante→recepción→lote→movimiento antes que las OP que los consumen, o el generador queda con OPs que consumen de lotes que no existen.
- Alcance faltante: `insumos`, `proveedores_produccion`, `insumo_lotes` y `movimientos_insumo` están en 0 filas — nada en Fases 1-4 los siembra. El plan original los da por sentado ('consumos = movimientos_insumo tipo consumo...') sin decir de dónde salen los insumos ni los proveedores. Es trabajo adicional real, no un detalle menor.
- `cerrar_produccion` deja `movimientos.sububicacion_id = NULL` para la entrada de producción, tal como decía el plan — pero verifiqué que es porque el Taller no tiene NINGUNA fila en `sububicaciones` hoy (0 filas), no porque la función tenga un caso especial para el Taller. `fn_sububicacion_por_defecto(taller_id,'entrada')` simplemente no encuentra nada que devolver. Frágil: si alguna vez se le crean sububicaciones al Taller, este comportamiento cambia sin que el código de cerrar_produccion se toque.
- El plan asume implícitamente que 'producción usa etapas corte/confeccion/acabado, muestra usa patronaje/muestra/escalado' como dos conjuntos separados — la base no lo exige: `set_etapa_produccion` acepta cualquiera de las 6 etapas fijas sin mirar `es_muestra`. Es una convención de UX, no una regla verificable en el esquema.
- `fn_recalcular_costo_variante` (llamada real dentro de `cerrar_produccion`) SÍ escribiría en `costo_historial` y actualizaría `variantes.costo` con origen='produccion' — el plan lo asume como parte de la receta. Pero la Fase 3 YA sembrada declina hacer el equivalente para compras/recepciones, con un comentario explícito en el script de que el costo se mantiene constante 'y no deja historial'. Seguir el plan al pie de la letra aquí introduciría una inconsistencia de diseño entre fases del mismo generador — lo marco como decisión abierta, no lo resolví unilateralmente.

### Riesgos cruzados con otras áreas
- `stock` es una tabla real (no vista) y solo la modifica `fn_aplicar_movimiento`, que NO es un trigger — nada la dispara automáticamente al insertar en `movimientos` o `movimientos_insumo`. Las Fases 3 y 4 ya sembradas tampoco la tocan (0 referencias a 'stock' como escritura en todo el archivo salvo comentarios). Si la Fase 6 ('stock derivado y cierre') asume que solo tiene que agregar `movimientos` para reconstruir `stock`, hay que confirmarle a quien la escriba que TAMBIÉN debe considerar los saldos de `movimientos_insumo` si alguna pantalla de Insumos depende de un snapshot derivado aparte (v_insumo_saldos es una VISTA que ya sabe sumar el ledger sola, así que insumo_lotes/movimientos_insumo probablemente no necesitan nada en Fase 6 — pero confirmarlo con esa sesión antes de asumir).
- Todo el árbol de Producción (`producciones`, `produccion_lineas`, `comprobantes_produccion*`, `insumos`, `insumo_lotes`, `movimientos_insumo`) no tiene NINGUNA policy de INSERT/UPDATE/DELETE en ninguna tabla — la única puerta son las RPC `security definer`. El COMMIT final se pega en el SQL Editor de producción (rol con bypass de RLS, según el resto del generador), así que el INSERT directo funciona iguial que en las Fases 1-4 ya sembradas — no es un riesgo nuevo, solo confirmando que aplica igual aquí.
- `comprobantes_produccion.proveedor_id` referencia `proveedores_produccion`, un directorio TOTALMENTE separado del `proveedores` que usa Compras (Fase 3). No reusar ids de proveedores de Compras para los comprobantes de Producción — violaría la FK.
- Si alguna otra sesión ya sembró parte de este árbol en paralelo (recomendado por CLAUDE.md: revisar `git status --short` y archivos tocados en las últimas horas antes de empezar), los conteos en 0 que verifiqué son de este momento (2026-09-22) — re-verificar antes de pegar, otra sesión pudo haber avanzado.
- Los ids de esta área deben usar `pg_temp.sid('produccion', clave)`, `pg_temp.sid('comp_prod', clave)`, `pg_temp.sid('insumo', clave)`, `pg_temp.sid('prov_prod', clave)`, etc. — prefijos NUEVOS para `pg_temp.sid`, no colisionan con los que ya usan las Fases 1-4 ('evento','item','envio','lote','mov','tras','ti','tr','caja','vi','pago','comp', etc.), pero conviene que quien integre todas las fases revise que ningún otro área haya elegido el mismo prefijo de tabla lógica para otra cosa.

### Preguntas abiertas
- ¿Se actualiza `variantes.costo` / se escribe en `costo_historial` (origen='produccion') al cerrar cada OP, replicando `fn_recalcular_costo_variante`? La función real lo hace, pero la Fase 3 ya sembrada decidió NO hacer el equivalente para compras ('el costo es constante, no deja historial') — seguir esa misma convención en Producción por consistencia, o divergir a propósito porque Producción sí es donde 'nace' el costo real de la prenda (razón de negocio distinta a una compra). Recomiendo seguir el precedente de Fase 3 (no tocar costo_historial) salvo que Felipe prefiera lo contrario.
- ¿De dónde salen los ~30 producto_id de las OP? Recomiendo reusar productos ya sembrados en Fase 1 (tmp_productos_nuevos/tmp_variantes_nuevas, si siguen en scope de la misma transacción) en vez de crear productos nuevos solo para Producción — confirmar que esas temp tables no se dropean entre fases.
- Mecanismo de la anomalía 'OP con merma': ¿reducir cantidad_buenas por debajo del plan (más simple, recomendado) o sobre-consumir insumos respecto al ratio esperado (más realista pero más riesgo de constraint)? Ninguna de las dos está forzada por el plan original ni por la base.
- ¿Cuántos de los ~12 comprobantes_produccion son 'concepto libre' (pago a taller tercerizado, alimenta costo_maquila) vs. cuántos son compra real de insumo (alimentan insumo_lotes que luego consumen las OP)? El plan original solo dice '~12 comprobantes (pagos a talleres externos/proveedores de insumo)' sin repartir cuántos de cada tipo — necesario para que el volumen de insumo_lotes generado alcance para las ~30 OP sin que el FIFO se quede sin saldo.

### Receta verificada

RECETA — Fase 5 · Producción del Taller (área "produccion_ordenes")
Verificado en vivo el 2026-09-22 contra vovjyyiafkxteijimpuy (schema retail). Toda función citada abajo se leyó con pg_get_functiondef; todo constraint con pg_get_constraintdef.

0) ALCANCE QUE EL PLAN ORIGINAL NO CUBRÍA (hay que sembrarlo primero, o la Fase 5 no tiene de dónde consumir)
`insumos`, `proveedores_produccion`, `insumo_lotes` y `movimientos_insumo` están en 0 filas — el plan que me pasaron asume que "insumos ya existe" (lo dice el doc de arquitectura, pero es del catálogo huérfano *de otra época*, no de datos sembrados en este proyecto). Antes de las ~30 OP hace falta:
  a. proveedores_produccion — un puñado (sugerido: 2 talleres tercerizados para maquila + 2-3 proveedores de tela/avíos). Usar pg_temp.sid('prov_prod', clave) para los ids.
  b. insumos — catálogo mínimo de telas y avíos que las OP van a consumir (código único, tipo 'tela'|'avio', unidad_medida de la lista cerrada). pg_temp.sid('insumo', codigo).
Esto es trabajo NUEVO respecto al texto del plan, no una corrección menor — coordinar con quien arme el orden global de la Fase 5 para que estos dos catálogos se siembren ANTES que los comprobantes.

1) `comprobantes_produccion` (~12) — replica `registrar_comprobante_produccion`
INSERT directo en comprobantes_produccion + comprobantes_produccion_items, con subtotal=sum(round(cantidad*costo_unitario,2)) por línea, igv = round(subtotal*0.18,2) solo si tipo='factura' (si no, igv=0 por el CHECK), total=subtotal+igv. condicion='contado' → llenar comprobantes_produccion_pagos EN EL MISMO PASO con grupo_id = NULL (así lo hace el RPC cuando el pago va en el mismo llamado). condicion='credito' → fecha_vencimiento obligatoria, sin pago en este paso.
ids: pg_temp.sid('comp_prod', clave). usuario_id/firmante: SOLO líder — `pg_temp.firmante(null, fecha_emision, true, 'compprod:'||clave)`, igual que ya hace la Fase 3 con pagos y notas de crédito de Compras (líder-only ahí también).

2) Recepción + lotes — replica `recibir_comprobante_produccion`
Para cada ítem con insumo_id NOT NULL: insertar UNA fila en comprobantes_produccion_recepciones (ubicacion_id = Taller), y por esa recepción una fila en insumo_lotes por línea recibida (comprobante_item_id = el item, recepcion_id = la recepción recién creada, costo_unitario = el de la línea, fecha_ingreso >= fecha_emision del comprobante, origen='compra') + su movimiento_insumo gemelo tipo='compra' (mismo insumo_lote_id, misma cantidad, mismo costo_unitario, produccion_id NULL — el CHECK lo exige). Los ítems con insumo_id NULL (concepto libre, p.ej. "maquila orden X") NO generan lote ni recepción — son solo AP.
Si algún comprobante debe simular pago a crédito posterior, agregar ahí comprobantes_produccion_pagos con grupo_id NO nulo (coalesce a un uuid nuevo por cada llamada simulada, incluso si es un solo pago) — replica `registrar_pago_comprobante_produccion`.

3) `producciones` + `produccion_lineas` (~30 OP) — replica `abrir_produccion`
Reutilizar productos/variantes YA sembrados en Fase 1 (tmp_productos_nuevos / tmp_variantes_nuevas si siguen en scope de la misma transacción — el script entero corre en un solo `begin` sin commits intermedios, así que las temp tables `on commit drop` de fases previas siguen vivas). cantidad_plan de producciones = suma de cantidad_plan de sus produccion_lineas (agrupando por variante como hace abrir_produccion: "select v_id, variante_id, sum(cantidad) ... group by variante_id" — dos líneas de la misma variante en el generador también deben sumarse, no duplicarse, o choca con el UNIQUE(produccion_id,variante_id)). etapas: jsonb con las claves que correspondan del set fijo `{patronaje,muestra,escalado,corte,confeccion,acabado}` y valores del set fijo `{pendiente,hecho,tercerizado}` — OJO: la base NO distingue "producción usa corte/confeccion/acabado, muestra usa patronaje/muestra/escalado" como dos conjuntos separados (esa frase del plan original es una convención de uso, no una regla de base: `set_etapa_produccion` acepta cualquiera de las 6 etapas sin mirar `es_muestra`). costo_tela/costo_avios/costo_maquila arrancan en 0 (o en un valor nominal si se decide no simular consumo de insumos para todas). ids: pg_temp.sid('produccion', clave). creado_por / firmante: líder O colaborador asignado al Taller — `pg_temp.firmante(taller_id, fecha_apertura, false, 'op:'||clave)`.

4) Consumo FIFO de insumos — replica `registrar_consumo_insumo`, LA PARTE MÁS FRÁGIL
Por cada (OP, insumo) a consumir: recorrer insumo_lotes de ese insumo_id + ubicacion_id=Taller ordenados por (fecha_ingreso, created_at); para cada lote calcular saldo = cantidad_ingresada − sum(movimientos_insumo.cantidad where tipo in ('consumo','merma')) + sum(... where tipo='devolucion'); tomar el PRIMER lote con saldo>0 y verificar saldo >= cantidad pedida — si no alcanza, la función real RECHAZA (no reparte entre dos lotes: "si de verdad necesitas cruzar de lote, registra el consumo en dos llamadas"), así que el generador debe dimensionar cada consumo para que quepa en un solo lote, o hacer dos INSERT de tipo='consumo' explícitos contra dos lotes distintos — nunca un solo INSERT que "cruce" lotes. Insertar el movimiento tipo='consumo' con ese insumo_lote_id, costo_unitario = el del lote (no un promedio), produccion_id = la OP.
Después de TODOS los consumos de esa OP (o incluso después de cada uno — la función es idempotente porque recalcula desde cero, no incrementalmente): fijar producciones.costo_tela y costo_avios ejecutando la MISMA lógica que `fn_recalcular_costo_insumos_produccion`: costo_tela = round(sum((consumo⇒+1, devolucion⇒-1) * cantidad * costo_unitario) filtrando insumos.tipo='tela' para esa produccion_id, sobre movimientos_insumo tipo in ('consumo','devolucion')), y análogo para costo_avios con insumos.tipo='avio' — PERO SOLO actualizar cada columna si hubo AL MENOS una fila de ese tipo (si n_tela=0, costo_tela NO se toca, se queda en lo que puso 'abrir_produccion'). Este orden — líneas → consumos FIFO → recálculo de costo — es exactamente el que pide el plan original y coincide con lo verificado en vivo.

5) Cierre — replica `cerrar_produccion`
UPDATE producciones: cantidad_buenas = suma de produccion_lineas.cantidad_buenas (las líneas sin buenas asignada quedan en 0, nunca se borran — a diferencia de V1); costo_tela/costo_avios = lo que dejó el paso 4 (si no hubo consumo de insumos simulado para esa OP, fijar un valor nominal directo aquí, replicando el default de abrir_produccion); costo_maquila = valor manual (pago al taller tercerizado, no viene de insumos); estado='terminada'; inventariado_at = NULL si es_muestra, si no el timestamp de cierre. costo_unitario NUNCA se inserta — es GENERATED. Si es_muestra: TERMINA AQUÍ, no genera movimientos (confirmado: `if v_orden.es_muestra then return; end if;`).
Si no es muestra: por cada línea con cantidad_buenas>0, INSERT en movimientos (variante_id, ubicacion_id=Taller, sububicacion_id=NULL, tipo='entrada', cantidad=cantidad_buenas, motivo='produccion', produccion_id=la OP, usuario_id=firmante). Verificado en vivo: sububicacion_id sale NULL porque el Taller HOY no tiene ninguna fila en `sububicaciones` (0 filas) — `fn_sububicacion_por_defecto` no encuentra 'almacen_tienda' ahí y devuelve NULL por diseño de la función (no por un caso especial para Taller). El plan original decía "sub NULL" y es correcto, pero por esta razón frágil: si algún día alguien le crea sububicaciones al Taller (para separarlo en almacén/piso como las tiendas), este comportamiento cambia solo sin que nadie toque `cerrar_produccion`.
`fn_aplicar_movimiento` NO es un trigger — nadie la dispara sola al insertar en `movimientos`. La Fase 5, igual que las Fases 3 y 4 ya sembradas (ninguna llama fn_aplicar_movimiento ni escribe `stock`), debe dejar `stock` intacto: eso es explícitamente Fase 6 ("stock derivado y cierre") según el propio encabezado del archivo (línea 22).
DECISIÓN ABIERTA — costo_historial / variantes.costo: la función real SÍ llama `fn_recalcular_costo_variante(variante_id, cantidad_buenas, costo_unitario_de_la_OP, 'produccion', movimiento_id)` por cada línea, que promedia `variantes.costo` y deja un rastro en `costo_historial`. PERO la Fase 3 ya sembrada declina hacer esto para las compras/recepciones equivalentes — comentario explícito en el script: "el costo es el costo declarado de la prenda (constante: no toca el costo ni deja historial)". Por consistencia con ese precedente, mi recomendación es que la Fase 5 haga LO MISMO (no tocar variantes.costo ni costo_historial) — pero es una decisión de diseño del generador, no algo que pueda decidir solo por mi cuenta; lo marco en preguntas_abiertas.

6) Anomalía A11
- 1 OP atrasada: estado='en_proceso', fecha_entrega en el pasado, sin cierre. Puede o no tener consumos ya registrados (a elección) — el CHECK producciones_terminada_coherente no exige nada más.
- 1-2 OP anuladas SIN consumos: estado='anulada', cantidad_buenas=NULL, inventariado_at=NULL, CERO filas en movimientos_insumo con esa produccion_id (ni consumo ni devolución) — replica exactamente lo que hace `anular_produccion` cuando no hay nada que devolver (su loop sobre movimientos_insumo no encuentra filas y no inserta nada). nota = concat_ws(' · ', nota_original, motivo) — así es como el RPC real concatena, no en columna aparte.
- 1 OP con merma: el plan no especifica el mecanismo y la base NO tiene una forma directa de "mermar una producción" — `movimientos_insumo` tipo='merma' EXIGE produccion_id NULL (no se puede atar una merma de insumo a una OP puntual). Dos caminos válidos, cualquiera es correcto según la base, hay que elegir uno: (A) cantidad_buenas de una o más líneas queda claramente por debajo de cantidad_plan al cerrar (merma de prendas, la ruta más simple, cero riesgo de constraint); (B) el consumo real de tela/avíos de esa OP es mayor al ratio 1:1 esperado (se registra más consumo del "teórico", empujando costo_tela más alto — simula desperdicio de material). Recomiendo (A) por ser la de menor riesgo de tropezar con un CHECK.

---
