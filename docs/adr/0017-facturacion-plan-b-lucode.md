# ADR-0017 — Facturación con plan B: la cola es `comprobantes` y todo correlativo tiene salida

**Fecha:** 2026-09-05
**Estado:** Propuesto — sale de la auditoría del 2026-09-05. La fusión de las
dos migraciones (punto 1) ya está escrita en
`supabase/unificacion/23_facturacion_fase1.sql`, pendiente de pegar; la cola, el
reintento y la baja no están escritos. Bloquea la prioridad #1 de la semana.

## Contexto

ADR-0005 decidió PSE/Lucode y ADR-0009 construyó la Fase 1. Lo que la auditoría
encontró es que la degradación está pensada para "Lucode no responde" y no para
los otros dos modos de falla, que son más probables.

**1. Falta media transacción, y la mitad que falta es la que guarda.**
`retail.actualizar_transmision_comprobante` **no existe en producción**, en
ningún schema (`select n.nspname, p.oid::regprocedure from pg_proc p join
pg_namespace n on n.oid=p.pronamespace where p.proname like '%transmision%'` → 0
filas). `apps/web/app/api/lucode/emitir/route.ts` transmite a SUNAT y después la
llama para guardar el resultado. Las dos migraciones que hacen falta
(`unificacion/20_comprobantes_items.sql` y
`21_actualizar_transmision_comprobante.sql`) están sin pegar —
`retail.comprobantes` tiene 21 columnas y ninguna es `items`— y **el
`docs/BACKLOG.md` las lista en el orden peligroso**: pegar el `20` sin el `21`
abre la ventana en que la lectura pasa, Lucode transmite, SUNAT acepta y el
guardado revienta. El correlativo queda quemado y el comprobante en `pendiente`,
que es el estado que la UI ofrece volver a transmitir.

**2. Un correlativo quemado no tiene salida, y no hay reintento.**
`anularDocumentoLucode` está escrita (`apps/web/lib/lucode.ts:271`) y no la llama
nadie; no existe ruta `/api/lucode/anular` (el único directorio bajo
`apps/web/app/api/lucode/` es `emitir`). `comprobantes_estado_check`
(`0032_comprobantes.sql:40`) admite `'anulado'` pero **ninguna RPC lo escribe** —
`0038_actualizar_transmision_comprobante.sql:11` lo rechaza explícitamente: es un
estado inalcanzable. Y no hay cola: cuando Lucode no responde, la ruta devuelve
502 y deja el estado quieto; no hay `vercel.json` ni ningún cron en el repo. Un
sábado con Lucode caído deja 20 boletas en `pendiente` que alguien tiene que
recordar transmitir a mano el lunes. **Agravante que el adaptador esconde:** la
firma es `anularDocumentoLucode(tipo: Exclude<TipoDocumentoLucode, "boleta">,
...)` — no puede anular una boleta, que es el 90% de lo que emite una tienda.

Contexto que acota el riesgo de hoy: `retail.comprobantes` y
`retail.series_comprobantes` tienen **0 filas**. No hay ningún correlativo en
riesgo todavía; la primera boleta real es exactamente el disparo.

## Decisión

**DECIDÍ: transmitir y registrar dejan de poder aplicarse a medias, y
`comprobantes` es su propia cola.**

1. **Las dos migraciones se fusionan en un solo archivo**
   (`unificacion/23_facturacion_fase1.sql`) y las dos sueltas quedan marcadas
   `SUPERADO` —con la misma cabecera que ya usa
   `13_recibir_lote_valida_sede.sql`— para que sea físicamente imposible aplicar
   la mitad. Se registra en `retail.migraciones_aplicadas` (ADR-0011).
2. **La cola es la tabla que ya existe.** `comprobantes` gana `intentos int
   default 0`, `ultimo_intento_at timestamptz` y un estado `'enviando'`. Una
   ruta `/api/lucode/reintentar-pendientes` toma trabajo con `update
   comprobantes set estado='enviando', intentos=intentos+1 where id = ... and
   estado='pendiente' returning *` —**un UPDATE condicional, no un SELECT
   seguido de un UPDATE**— y un Vercel Cron la dispara cada 10 minutos, con tope
   de 3 días (después corresponde baja, no reintento).
3. **`dar_de_baja_comprobante(p_comprobante_id, p_motivo)`** para que
   `'anulado'` deje de ser código muerto en el CHECK: acepta solo
   `pendiente`/`rechazado`, y para lo ya transmitido llama a la ruta de
   anulación.
4. **El correlativo nunca se reserva sin conexión.**
   `fn_reservar_numero_serie` hace `select ... for update` sobre
   `series_comprobantes` y tiene que seguir así. **Una venta offline nace "sin
   comprobante"** y se emite al reconectar. Esta es la regla que ata este ADR
   con ADR-0013: el UUID de la venta lo genera el navegador y sobrevive sin red;
   el número de serie de SUNAT no, y no debe intentarlo.

**DESCARTÉ: una tabla de cola aparte (`transmisiones_pendientes`).** Es lo que
pediría un diseño de colas de libro. Cuesta dos fuentes de verdad sobre el
estado de un mismo comprobante, y la posibilidad —garantizada con el tiempo— de
que la cola diga "enviado" y `comprobantes` diga "pendiente", con nadie que
arbitre. `estado='pendiente'` **ya es** la cola; solo le faltaba el contador de
intentos.

**DESCARTÉ también: dejar el reintento solo manual, con el botón que ya
existe.** Es gratis. Cuesta que las 20 boletas de un sábado de TRU dependan de
que alguien se acuerde el lunes, con el plazo de baja corriendo mientras tanto.

**DESCARTÉ además: permitir que una venta offline reserve el correlativo
localmente y lo concilie después.** Es lo que hace que el modo offline se sienta
completo. Cuesta lo único que no se puede pagar: dos tiendas sin red el mismo
sábado reservan el mismo B001-000123, y cuando reconectan hay dos boletas
distintas con el mismo número ante SUNAT — una situación que no se corrige con
una nota de crédito, se corrige con una fiscalización.

**SE ROMPE SI: el cron y el botón manual transmiten el mismo comprobante a la
vez.** Es el escenario concreto: el cron toma la boleta de la clienta de AQP a
las 10:00:00 y la encargada aprieta "Transmitir" a las 10:00:01 porque la ve en
`pendiente`. Si la toma de trabajo es un `select ... where estado='pendiente'` y
después un `update`, la ventana entre las dos consultas es exactamente el bug
que este ADR venía a cerrar, y el resultado —el mismo correlativo enviado dos
veces a SUNAT— es peor que no haber hecho nada. Por eso (2) es un UPDATE
condicional que devuelve 0 filas para el segundo, y el botón manual pasa por el
mismo camino.

## Lo que NO se verificó en esta auditoría

Dos afirmaciones de dominio quedaron **sin contrastar contra
`cpe.sunat.gob.pe`** y se anotan como hipótesis, no como hechos: (a) el plazo de
7 días calendario para comunicar la baja de un comprobante no utilizado; (b) que
la serie de una nota de crédito deba compartir el prefijo del documento afectado
(B… para boleta, F… para factura). La segunda es la que decidiría si
`series_comprobantes` necesita cambiar su unicidad de `(sede_id, tipo)` a
`(sede_id, tipo, tipo_afectado)` — **hoy eso cuesta cero** (0 filas en series y
en comprobantes) y con 5.000 comprobantes cuesta una migración de datos.
Confirmar antes de tocar el esquema.

## Consecuencias

La facturación deja de tener un modo de falla que corrompe con probabilidad 1 en
el primer intento real, y "qué pasa si Lucode está caído" pasa a tener una
respuesta escrita: la venta se registra igual, el comprobante espera en
`pendiente`, el cron lo toma cuando vuelva la red, y si a los 3 días no volvió
corresponde baja, no reintento (principio 9).

Queda pendiente y hay que decidirlo con Lucode antes de emitir en volumen: **la
baja de una boleta no va por `/voided` sino por resumen diario**, y ni el
adaptador (`lucode.ts:271-272`, que excluye boletas por tipo) ni la ruta lo
contemplan. Es el caso más común de todos.

Quedan fuera de este ADR dos cosas que la auditoría encontró en la misma
pantalla y que son trabajo, no decisiones: `vender/facturacion/page.tsx` hace
`if (persona.rol !== "lider") redirect("/")`, lo que deja la emisión en manos de
5 admins para 5 sedes (23 de los 28 logins reales quedan fuera) **pese a que la
base ya permite más** — `emitir_comprobante` llama a `puede_operar_sede` y
`registrar_serie_comprobante` llama a `es_lider()`, así que el modelo correcto
ya está en el servidor y es la pantalla la que está de más; y el error de
`route.ts:106` ("Comprobante no encontrado o sin permiso para verlo") todavía se
puede confundir con el de esquema en algún camino, aunque el `42703`/`PGRST202`
ya está separado en `route.ts:93-102`.
