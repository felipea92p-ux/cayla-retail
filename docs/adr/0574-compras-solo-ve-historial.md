# ADR-0574 — Compras solo ve historial: lo que anota la compradora pasa solo a los libros

- **Fecha:** 2026-10-29 · **Estado:** construido y probado en local; las seis migraciones (`20261029191000` a `20261029200000`) **NO están en producción** (esperan el OK de Felipe).
- **Continúa a:** [ADR-0480](0480-compras-simple-en-cuatro-pasos.md) (Compras simple: la compradora anota, Compras revisa), [ADR-0571](0571-la-cuenta-de-la-devolucion-y-reabrir-en-tu-ultima-ronda.md) (la cuenta de la devolución) y [ADR-0569](0569-reabrir-la-ultima-ronda-de-compras.md) (reabrir la ronda).
- **Origen:** Felipe, 2026-10-29, mirando Mis compras: «ya devolví, ¿por qué me sigue apareciendo que tengo 1,400?» y, al explicarle por qué: «Compras no tiene que revisar y confirmar estos movimientos, solo lo puede ver como historial, no tiene que estar confirmándolo a cada rato». Y sobre la serie y el número: «también debe estar en el formulario del que compra, y este mismo elige el proveedor: no entiendo la necesidad de que Compras elija el proveedor».

## El problema

Todo lo que anotaba la compradora quedaba esperando a una persona de Compras: la plata que le dieron («Compras la confirma»), cada compra («Compras la revisa», que copiaba la serie y el número de la foto), cada gasto («qué papel le dieron») y lo que devuelve al cerrar la ronda («Entrégalo en caja»). Sus consecuencias, vistas en la pantalla de Felipe: el saldo seguía en S/ 1,400.00 aunque ya había decidido devolverlo, y Compras no podía ni recibir esa devolución mientras hubiera plata por confirmar (`recibir_cierre_compras` se niega).

El proveedor ya lo elige la compradora (`compra_papeles.proveedor_id not null`; Compras solo lo corrige). Lo único que solo Compras tenía era la serie y el número.

## Lo que se decidió (7 actividades, un commit cada una)

1. **El saldo baja al cerrar con devolución** (`20261029191000`). `fn_mi_plata_tiene` y `fn_mi_plata_compras` (clave nueva `devolucion_por_entregar`) restan los cierres `devuelve` sin recibir. La web lo suma a su cuenta (`devolucionPorEntregar`). Mientras Compras no lo recibe la fila dice «Por devolver en caja», no «Devolviste».
2. **La plata anotada entra sola** (`20261029192000`, `fn_plata_confirmar_sola`, la llama `anotar_plata_compras` dentro de un bloque que no la deja caer). **Decisión de Felipe, con su ganas/pagas:** una transferencia con banco indicado pasa del banco al fondo en el mismo instante; «ya tenía plata» fija el saldo inicial del fondo. Yape o Plin, efectivo y la transferencia sin banco siguen «por confirmar»: no se sabe de qué caja sale. Quien la confirma sola queda como la misma compradora (`confirmada_por = persona_id`).
   - **Felipe pidió que «ya tenía plata» saliera por defecto de «BCP Empresa». No se hizo así a propósito:** la tabla exige que «ya tenía» no tenga cuenta de origen ni movimiento (`fondo_plata_anotada_estado`: no es plata que salga de un banco) y debitar el banco por plata que ya estaba afuera lo dejaría en menos de lo que tiene. Si se prefiere así, es otra decisión con cambio de esquema.
3. **Serie y número al comprar** (`20261029193000`). `compra_papeles.serie` y `.numero`; `registrar_compra_rapida` con `p_serie` y `p_numero` (de fábrica null), las mismas reglas que `completar_papel_compra` y rechazo del mismo comprobante del mismo proveedor (`papel_repetido`). La de ocho parámetros se retira. El formulario de «Registrar compra» los pide (guía de foco incluida).
4. **El papel pasa solo a los libros al cerrar el conteo** (`20261029194000`). Un disparador en `despachos` (`trg_despacho_recibido_z_papel_a_libros`, después del de «recibido por quien compró») llama a `fn_papel_pasa_solo`, que usa la MISMA `completar_papel_compra` en modo «pasa solo» (configuración `retail.papel_pasa_sola`, solo dentro de la función interna): sin el módulo «Revisar compras» y a nombre de la compradora. Si falta mandar o cerrar otro envío, o es una factura o boleta de antes (sin serie), no hace nada. Si algo falla, el cierre del conteo NO se cae y el motivo queda en `compra_papeles.pasa_sola_error`.
5. **Los gastos pasan solos al cerrar la ronda** (`20261029195000`). La compradora dice el papel (y el RUC con una factura) al anotar «Gasté en otra cosa» (`registrar_gasto_rapido` con `p_papel` y `p_ruc`; el cuerpo de siempre queda como `fn_registrar_gasto_rapido_base`). `terminar_dia_compras` llama a `fn_gastos_pasan_solos`, que usa la misma `revisar_gasto_compra` en modo «pasa solo» (`retail.gasto_pasa_solo`). Pasan al CERRAR la ronda, no al anotar, para que puedan corregirse mientras tanto (ADR-0572). Un gasto sin papel (de antes) lo revisa Compras.
6. **Compras ve por qué algo no pasó** (`20261029200000`). `fn_revisar_compras` trae lo que escribió la compradora y el motivo; el detalle lo muestra ya lleno (Compras solo corrige) con un aviso; la pantalla explica que lo normal pasa solo.
7. Este ADR, la bitácora y el backlog.

## Lo que se pierde (dicho sin adornos)

- **D1 · Nadie mira el voucher de una transferencia.** Basta lo que diga la compradora; el banco baja lo que ella anotó. El control queda en el historial y en lo que cuadre Finanzas con el extracto.
- **D2 · Desaparece «nadie completa el papel de su propia compra».** Era una separación de funciones que protegía los libros: ahora el comprobante nace de lo que escribió quien compró.
- **Cerrar el conteo es definitivo para la compra.** Un envío cuya compra ya pasó a los libros no se reabre (`reabrir_papel_completado`, regla de siempre), solo que antes pasaba cuando Compras completaba y ahora al cerrar. Si hace falta un margen para corregir el conteo, es una decisión aparte (por ejemplo, pasar el papel un tiempo después).
- **D3 · Lo ya pendiente no se toca.** Las plata por confirmar y los papeles sin serie anotados antes quedan en la bandeja de Compras: mover plata de verdad sin que nadie la mire no se hizo en retroactivo. El caso de Felipe (S/ 5,700 por transferencia en «Compras la confirma») sigue así hasta que Compras la confirme.

## Pruebas

- `pnpm pruebas:compras-simple-historial` (nueva, corre sobre la base tal como está): serie y número, gastos y su cierre, y la lectura de «Revisar compras».
- Casos nuevos en `pruebas:compras-simple-plata` (lo que entra solo) y `pruebas:compras-simple-revisar` (el papel que pasa solo, el que falla sin tumbar el cierre).
- Las demás pruebas de Compras simple que pegan migraciones viejas **rebobinan** `registrar_compra_rapida` y `registrar_gasto_rapido` (`scripts/pruebas/rebobinar_registrar_compra.sql`), como ya hacían con `terminar_dia_compras`.
- En la base compartida de pruebas (`supabase_db_cayla-pila-compras`) hay 6 casos de `compras_simple_revisar`, 3 de `compra`, 2 de `recibir` y 1 de `plata` que ya fallaban ANTES de esto (datos que dejó otra sesión); se comprobó contra una copia sin estas migraciones. El CI usa una base limpia.
- Web: 735 archivos de prueba en verde, `pnpm knip` y `pnpm knip:produccion` limpios.

## Por pegar en producción (esperan el OK de Felipe)

Orden: `20261029191000`, `…192000`, `…193000`, `…194000`, `…195000`, `…200000`, cada una pegada entera y sola, **antes** de publicar la web (la web manda `p_serie`, `p_numero`, `p_papel` y `p_ruc`, que una base sin las migraciones no conoce). Ninguna mezcla `alter` de tablas en uso con políticas (ADR-0195).
