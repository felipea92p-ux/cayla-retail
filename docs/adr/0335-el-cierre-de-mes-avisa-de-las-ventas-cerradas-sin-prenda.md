# ADR-0335 · El cierre de mes avisa de las ventas cerradas sin prenda: un aviso que no bloquea y queda en el cierre

- **Fecha:** 2026-10-04 · **Estado:** aprobado por Felipe (opción A de tres, «Aviso que no bloquea»). Construido y verificado en una base local
  propia y en el navegador (escritorio y 375 px). **La migración NO está en producción** (`docs/backlog/2026-10-04-cierre-mes-ventas-cerradas-sin-prenda.md`
  trae la comprobación previa y la posterior, con la huella exacta que debe dar la función).
- **Pedido:** cerrar el pendiente que ADR-0334 dejó escrito en «Lo que queda abierto»: *«Finanzas ▸ Cierre de mes no nombra las ventas cerradas
  sin costo (excluye la variante «Cargo especial»). Tarea aparte con su decisión contable.»* Felipe eligió la decisión con una pregunta.
- **Usa y complementa:** ADR-0334 (el estado `cerrada_sin_prenda`), ADR-0195 F9 y ADR-0198 (el cierre de mes y sus chequeos), ADR-0253 (el
  cierre se delega por módulo: la función viva ya no es la del archivo), ADR-0179 (la venta sin registrar y su variante centinela).

## El problema, con las cifras de producción (solo lectura, 2026-10-04)

Una venta cerrada sin prenda conserva su línea en «Cargo especial» con `costo_unitario = 0`: **el ingreso es real y el costo no existe**, así que
el margen del mes sale inflado en esa parte. El cierre de mes no lo decía, por dos razones que se suman:

- el chequeo `regularizar` solo cuenta las `pendiente` (y las trata como **bloqueo**: el mes no cierra mientras haya una);
- el chequeo `sin_costo` excluye a propósito la centinela (`vi.variante_id <> c_cargo_especial`), porque hasta ADR-0334 esas líneas eran siempre
  pendientes y ya las frenaba `regularizar`.

Resultado: **cerrar la cola de arranque convertía un bloqueo en silencio.** Septiembre tiene hoy 31 ventas sin registrar pendientes (AQP 26 por
S/ 1,170.80; TRU 5 por S/ 370.60) que bloquean el cierre de septiembre. Si el líder cierra la cola antes de cerrar septiembre, esas 31 pasan a
`cerrada_sin_prenda`, el bloqueo desaparece, y septiembre se congela con huella con ese margen inflado sin que nadie lo sepa. Octubre trae 236 más
(AQP 144 por S/ 6,578.88; TRU 92 por S/ 5,299.68).

## Decisión (Felipe, 2026-10-04: opción A de tres)

**1. Un chequeo propio que avisa y no bloquea.**
DECIDÍ: `cerrada_sin_prenda`, un chequeo nuevo de `fn_cierre_mes_estado` por sede: «N ventas sin registrar (S/ X) se cerraron sin prenda: su costo es
desconocido y el margen del mes sale más alto de lo real. Puedes cerrar igual». No bloquea; al cerrar entra solo en `periodo_cierres.avisos`
(la función `cerrar_periodo` guarda todo chequeo que no pasa, no bloquea y no es la huella), así que **el mes congelado deja constancia de lo que
no sabía**. La pantalla lo muestra con «Ver ventas» (lleva a Existencias ▸ Ventas sin registrar, en esa sede, donde están en «Cerradas») y la hoja
de cierre lo lista entre «Cierras con N avisos».
DESCARTÉ: (B) **bloquear el cierre**, porque un mes con cola cerrada no se podría cerrar jamás —la prenda no se puede identificar, y regularizarla
después choca con el candado del mes cerrado— y eso deshace en la práctica lo que ADR-0334 permite. (C) **estimar un costo por categoría**, porque
inventa un número que parece real y queda congelado con huella en el diario; ADR-0334 (decisión 7) ya lo descartó y el principio es «dinero exacto».
SE ROMPE SI: un líder cierra un mes leyendo solo los números y no el aviso. El aviso es visible y va en la hoja de cierre, pero no es un candado:
la decisión de cerrar con margen inflado es suya y queda escrita.

**2. Aparte de `sin_costo`, no dentro.**
DECIDÍ: dos chequeos. `sin_costo` es una prenda real con costo 0: **tiene cura** (cargarle el costo) y su botón es «Resolver». `cerrada_sin_prenda` no
tiene cura (la prenda ya no se puede identificar): su botón es «Ver ventas», solo mirar. Van contiguos (orden 7 y 8; `diario` pasa a 9 y `huella` a 10).
DESCARTÉ: sumarlas en un solo «ventas sin costo», porque mezcla un problema que se arregla con uno que no, y la persona que cierra no sabe cuál es cuál.
SE ROMPE SI: alguien carga el costo a una línea de «Cargo especial»: dejaría de ser una venta sin registrar (se regulariza) y saldría del aviso sola.

**3. Solo cuenta lo que SÍ está en el ingreso del mes.**
DECIDÍ: filas en estado `cerrada_sin_prenda` cuya venta está `completada`, no es de prueba y es del mes (por `v.created_at`, el mismo mes que usa el
diario). Una venta anulada después de cerrarse (su fila pasa a `anulada`) o marcada de prueba no cuenta, ni una cerrada en otro mes.
DESCARTÉ: contar por `r.estado` solo: una venta anulada «por fuera» del disparador seguiría dando un aviso por un ingreso que ya no está.
SE ROMPE SI: aparece otro estado de venta que no es `completada` pero sí cuenta en el ingreso. Hoy `sc` (sin costo) y el diario usan el mismo criterio.

## Cómo se aplica (y por qué es un parche, no una reescritura)

La versión VIVA de `fn_cierre_mes_estado` no es la del archivo `20260925180000`: `20260928220000` le cambió la puerta (`fn_es_lider()` →
`fn_puede_cerrar_mes()`, ADR-0253) editando su definición viva. Recrearla desde el archivo habría borrado esa delegación. La migración
`20261005130000_cierre_mes_avisa_ventas_cerradas_sin_prenda.sql` reemplaza **tres anclas** del texto vivo, cada una debe aparecer EXACTAMENTE una vez
o se aborta sin tocar nada: la CTE nueva `cs` (antes de `pm as (`), la fila del chequeo (con `diario` 8→9) y `huella` 9→10. Es re-ejecutable (mira
primero si el texto nuevo ya está: la CTE nueva contiene su propia ancla) y no toca tablas ni políticas, así que no toma candados exclusivos.

**Medido el 2026-10-04 contra producción (solo lectura):** las tres anclas aparecen una vez y la función viva (`md5 eb662db552768944df408abc3b483778`,
12,311 caracteres) es **idéntica byte por byte** a la de mi base de pruebas con las 447 migraciones aplicadas. Después del parche la función da
`md5 ea9dede5a8c7a70191867b31bd1c6f73` y 13,199 caracteres: ese es el número que debe verse en producción tras pegar.

Es independiente de ADR-0334: compara `r.estado = 'cerrada_sin_prenda'` como texto, así que antes de pegar la cola de arranque no hay filas así y el
aviso no aparece; después aparece solo. Se puede pegar antes o después de las cinco migraciones de ese ADR.

## Cómo se verifica

- `pnpm pruebas:cierre-mes`: **124 casos** (104 de siempre + 20 del bloque nuevo «G»): pendientes no avisan (las frena `regularizar`) · cerrada la cola
  con la función real `cerrar_cola_arranque` el aviso aparece con su cuenta y su monto · no bloquea y `regularizar` y `sin_costo` no las cuentan ·
  otra sede, otro mes, venta de prueba y venta anulada (por el disparador y por fuera de él) no cuentan · el orden en pantalla · reabrir una cerrada la
  saca del aviso y vuelve a bloquear como pendiente · el mes se cierra con el aviso y queda guardado en `periodo_cierres.avisos` con su monto · la
  huella no cambia.
- **Prueba de mutación:** se rompió a propósito cada candado de la función viva (contar pendientes en vez de cerradas, que el aviso bloquee, quitar el
  filtro de mes, el de prueba, el de venta completada, la llave por sede, el orden, el monto) y la prueba falló **8 de 8 veces**. El caso de «anulada por
  fuera del disparador» existe porque sin él la mutación de `v.estado = 'completada'` sobrevivía.
- Vitest: `lib/cierre-reglas.test.ts` (26) — el texto, el enlace, la etiqueta del botón y que un aviso no impide cerrar.
- Navegador (andamio local con el JSON real de `fn_cierre_panel`): el aviso entre «sin costo» y «el diario», el botón «Ver ventas» con el enlace
  correcto, la hoja «Cierras con 2 avisos», sin desborde a 375 px.

## Lo que queda abierto

- **El Estado de resultados tiene la misma exclusión y no nombra las cerradas.** `fn_estado_resultados` (`sc`, `unidades_sin_costo`) sigue con
  `vi.variante_id <> '2222…'` (verificado en producción el 2026-10-04): el margen que lee el contador a diario sale inflado sin ningún aviso, y el cierre
  lo congela. Esta ADR avisa **en el momento de cerrar**; falta que el reporte lo diga siempre. Además `fn_rentabilidad` cuenta la centinela como «sin
  costo» y `fn_estado_resultados` no: dos pantallas dicen distinto de lo mismo. Tarea aparte, con su decisión.
- **Reabrir una venta cerrada de un mes ya cerrado** la devuelve a `pendiente`, pero regularizarla cambia su costo y el candado del mes la frena
  («reábrelo con motivo para cambiar esta prenda vendida»): para identificarla hay que reabrir el mes primero. Es el comportamiento correcto del candado;
  ADR-0334 podría avisarlo en la hoja de reabrir.
- El enlace del chequeo `regularizar` apuntaba a `/recibir`, que desde ADR-0330 ya no muestra la lista: se corrigió aquí (ahora lleva a
  `/inventario/por-regularizar?ubicacion=…`) porque el chequeo nuevo comparte el destino.
- El consolidado «CAYLA entera» no tiene chequeos propios: el aviso vive en cada sede. Si Felipe quiere verlo sumado al cerrar el consolidado, es una
  línea más en la hoja.
