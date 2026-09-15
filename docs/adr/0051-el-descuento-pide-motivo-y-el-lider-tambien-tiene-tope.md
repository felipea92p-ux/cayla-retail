# ADR-0051 — El descuento pide motivo, y el Líder también tiene tope

**Fecha:** 2026-09-15
**Estado:** Aplicado en local (`20260915140000_descuento_motivo_y_escalonado.sql`).
**No aplicado en producción** — la pega Felipe (D-11); ya lleva `retail.` cuando toque.
**Afecta:** `retail.registrar_venta` (misma firma de 11 parámetros — sin `drop`, los tres
campos nuevos viajan dentro de cada `p_items[]`), tabla `retail.venta_items` (3 columnas
nuevas), `apps/web/lib/vender-reglas.ts`, `apps/web/lib/error-escritura.ts`,
`apps/web/components/PuntoDeVenta.tsx`, `apps/web/components/PuntoDeVentaTicket.tsx`.

## Contexto

R-45 y D-44 (`docs/datos/DECISIONES-2026-09-12.md`, `docs/datos/15-COMO-OPERA-CAYLA.md`)
se decidieron el 2026-09-12: todo descuento necesita un motivo de lista cerrada, nunca
puede dejar el precio por debajo del costo, y un Líder tiene su propio escalonado (hasta
20 % solo; 20-35 % con argumento escrito; más de 35 % lo autoriza Felipe). La
implementación del descuento manual, dos días después (ADR-0044 adenda 2, ADR-0048),
resolvió el lado de la Colaboradora (código con tope) pero dejó al Líder sin ningún
candado: `registrar_venta` hoy deja pasar cualquier % de un Líder, sin motivo, sin
argumento, y sin mirar el costo. Es el hueco que este ADR cierra, encontrado al analizar
una comparativa externa del POS contra siete ERP/POS y volver sobre R-45/D-44.

De paso, la comparativa también señalaba que solo existía descuento en %, no en soles —
Xstore («Add Discount») admite las dos.

## Decisión

**Motivo y candado de costo son de todos; el escalonado por banda es solo del Líder.**

1. **Motivo de lista cerrada, para cualquier descuento > 0** (R-45, punto 2): cumpleaños
   clienta top, prenda con desperfecto, liquidación de temporada, cerrar la venta, u
   otro (con detalle obligatorio). Aplica igual a un Líder o a una Colaboradora — «un
   texto libre no se puede sumar; una lista sí, y a fin de mes se ve cuánto margen se
   fue por cada motivo».
2. **Nunca por debajo del costo, sin importar quién descuente** (R-45, punto 1): la
   Encargada no ve `variantes.costo` y no tiene cómo saberlo — el candado frena sin
   revelar el número, en el mismo `raise exception` que ya usa `venta_precio_cambiado`.
3. **El escalonado por % es solo del Líder** — la Colaboradora sigue con su propio tope,
   el código (ADR-0048), un mecanismo distinto que Felipe ya gobierna al crear cada
   código en Studio:
   - hasta 20 %: el Líder sola, como hoy.
   - 20 % a 35 %: el Líder, con un argumento escrito (columna nueva, sin lista cerrada
     — es prosa libre, no se necesita sumar por categoría).
   - más de 35 %: **nadie, ni el Líder — decisión explícita de Felipe (2026-09-15)**.
     R-45 dice «lo autoriza Felipe», pero la base hoy solo distingue Líder/Colaborador
     (D-12, los cuatro niveles de rol, no existe todavía): no hay forma de saber si
     detrás de una sesión de Líder está Felipe o cualquiera de las otras 8 personas
     registradas. Construir un mecanismo para identificarlo específicamente (una
     bandera en `personas`, un código especial solo para él) se descartó por ahora —
     ver «Se descartó» — y el 35 % queda como techo duro hasta que haga falta de verdad.
4. **Descuento en soles, no solo en %** — la otra entrada que pedía la comparativa. Es
   puramente de pantalla: `aplicarDescuentoMonto()` en `vender-reglas.ts` convierte un
   monto por unidad al mismo `descuentoUnitario` que ya guarda `venta_items`, con el
   mismo candado `venta_items_descuento_no_supera_precio`. La RPC no distingue cómo se
   llegó al número — valida el resultado, no el camino.
5. **Las dos constraints que dependen de rol van `NOT VALID`.** 4 filas en local y 9 en
   producción (medido 2026-09-15) ya tienen `descuento_unitario > 0` sin motivo — son
   historia de antes de este ADR, y el repo no reescribe historia (principio 4). El
   candado corre desde ahora en adelante; las filas viejas quedan tal cual.
6. **El apartado de descuento pide el motivo antes de dejar aplicar** (validación de
   pantalla, no una segunda copia de la regla: es «¿hay texto en este campo?», no un
   umbral que pudiera desalinearse con la base). El campo «Argumento» aparece recién
   pasado el 20 % para un Líder — progresividad, no el candado; el candado real vive en
   `registrar_venta` y es el único que decide.

## Se descartó

- **Identificar a Felipe específicamente para dejarlo pasar de 35 %** (una bandera
  `es_fundador` en `personas`, o un código especial solo para él): cierra R-45 tal como
  está escrito, pero agrega una columna nueva al modelo de personas por una regla que
  producción nunca ha usado (0 ventas con descuento > 35 % medido el 2026-09-15).
  Decisión de Felipe: más simple y más seguro bloquear sin excepción por ahora: «el día
  que necesite superarlo en una venta real, lo subimos a mano en Studio».
- **Reusar `codigos_descuento` también para el Líder arriba de 35 %**: cualquier Líder
  puede crear códigos (ADR-0048), así que esto autorizaría «un Líder», no
  específicamente a Felipe — no cumple la letra de R-45. Mismo motivo que el punto
  anterior.
- **Validar el % o el motivo completo en el navegador antes de cobrar** (mirroring
  ADR-0048 §3): sería una segunda copia de la regla de negocio (bandas, tope de costo).
  Lo único que el apartado exige localmente es que el campo de motivo no esté vacío —
  eso no es una regla de negocio, es una validación de formulario.
- **Motivo o argumento como texto libre en vez de lista cerrada**: R-45 lo pide
  explícito — «un texto libre no se puede sumar».

## Consecuencias

- Una venta con descuento que no traiga motivo válido falla con
  `venta_descuento_requiere_motivo`; con motivo «otro» sin detalle, con
  `venta_descuento_otro_sin_detalle`; por debajo del costo, con
  `venta_descuento_bajo_costo` (sin revelar el número); un Líder entre 20 % y 35 % sin
  argumento, con `venta_descuento_requiere_argumento`; por encima de 35 %, con
  `venta_descuento_supera_autorizacion` — los cinco traducidos en `error-escritura.ts`.
- `venta_items` guarda `motivo_descuento`, `motivo_descuento_detalle` y
  `argumento_descuento` — la base para el reporte que R-45 pedía («cuánto margen se fue
  por cada motivo»), todavía sin pantalla propia (queda en el BACKLOG).
- Cambiar el precio de una variante mientras hay un ticket con descuento sigue
  fallando primero por `venta_precio_cambiado` (el candado de ADR-0048 corre antes, en
  el mismo recorrido de `p_items`).
- Producción sigue con la RPC de ayer hasta que Felipe pegue esta migración; el front ya
  manda `motivo_descuento`/`argumento_descuento` dentro de cada ítem, que la RPC vieja
  simplemente ignora (no rompe: son campos dentro del jsonb, no parámetros nuevos) — así
  que el descuento en producción sigue funcionando sin motivo hasta que se pegue,
  a diferencia de otros cambios de este repo que sí bloquean el cobro hasta pegar.

## Verificación

- `vender-reglas.test.ts`: 15 pruebas nuevas (`descuentoUnitarioPorMonto`,
  `aplicarDescuento`/`aplicarDescuentoMonto` con motivo y argumento,
  `necesitaArgumentoEscrito`); suite 220/220 antes del merge con `origin/main`, 228/228
  después.
- `error-escritura.test.ts`: 5 pruebas nuevas, una por huella nueva.
- psql, 10 escenarios en transacciones con `rollback` (impersonando Líder y
  Colaboradora vía `set local role authenticated` + `request.jwt.claims`): Líder 15 %
  con motivo pasa · sin motivo falla · «otro» sin detalle falla · Colaboradora con
  código 90 % que deja bajo costo falla (candado universal confirmado) · Líder 25 % sin
  argumento falla · con argumento pasa · Líder 40 % con argumento falla igual (el techo
  no tiene excepción) · Colaboradora con código válido sin motivo falla (el motivo se
  exige antes que el código) · Colaboradora con código y motivo pasa · un motivo
  inventado lo rechaza el `check` del esquema, no solo la RPC.
- Navegador real, de punta a punta, como Líder (Tienda Lima): 25 % con motivo «cerrar
  la venta» y argumento → Boleta B001-000010, verificado en la base
  (`motivo_descuento`, `argumento_descuento` y `costo_unitario` correctos); 40 % con
  argumento → rechazado con el mensaje exacto, sin dejar fila en `venta_items`; modo
  S/20 con motivo «prenda con desperfecto», sin argumento (11 % no pasa 20 %) → Boleta
  B001-000011, verificado en la base.
