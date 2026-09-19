# ADR-0129 — Proveedores: CCI, Yape/Plin y titular de la cuenta

- **Fecha:** 2026-09-19
- **Estado:** Aceptado (Felipe, 2026-09-19). **Base: aplicada en producción el 2026-09-19** — registrada como
  `20260919173940 proveedores_cci_y_billetera` (el archivo del repo es `20260919170000_proveedores_cci_y_billetera.sql`;
  se renumera al aplicarla, patrón habitual). **Web: en el PR de la rama `comprobantes-ui-ux-animations`.**
- **Decide:** Felipe (pidió que el proveedor guarde CCI, celular de billetera y titular, y confirmó el cambio de
  esquema en producción). Arquitectura: este documento.
- **Diseño:** `docs/maquetas/comprobantes-animaciones-2026-09/` (`comprobantes-vivo.html` y la propuesta
  `PROPUESTA-CUENTAS-PROVEEDOR.md`, que precede a esta decisión).
- **Migración:** `supabase/migrations/20260919170000_proveedores_cci_y_billetera.sql` (su cabecera repite el porqué).
- **Toca** ADR-0094 (ficha ampliada) y ADR-0128 (vista rápida): agrega datos de pago encima de un rediseño ya fusionado.
  **No cierra** la decisión abierta de D-27 sobre quién ve los datos de pago (ver «Qué queda pendiente»).

## Contexto — el problema

Pagar a un proveedor exige un destino inequívoco, y un destino mal rotulado es plata enviada al lugar equivocado que no
se revierte. Lo que había en `retail.proveedores` para pagar:

- `cuenta_bancaria`: texto libre, sin candado. La pantalla lo rotulaba «CCI» (la ficha decía «CCI …», el botón decía
  «Copiar CCI») aunque pudiera ser una cuenta local de 10–14 dígitos.
- `telefono`: el WhatsApp del contacto, que `PagoJuntosModal.tsx:192` mostraba como «Yape / Plin». Yapear al celular de
  WhatsApp equivocado es exactamente el error que no se deshace.
- Nada decía *a nombre de quién* está la cuenta, ni con qué app se le paga.

Hallazgo que justifica el ADR: el modal de pago juntos rotulaba `telefono` como «Yape / Plin» y la ficha rotulaba «CCI» a un
texto libre. La maqueta de Comprobantes (registrar pago con la cuenta del proveedor a la vista) no tenía de dónde sacar
esos datos.

Estado real en producción al decidir (2026-09-19): 2 proveedores y **ninguna cuenta cargada**. Cambiar ahora cuesta
minutos; con volumen de pagos costaría una migración de datos.

## Decisión

**D1 — Cuatro columnas nuevas en `retail.proveedores`, cada una con su candado.**

| Columna | Qué guarda | Candado |
|---|---|---|
| `cci` | Código de Cuenta Interbancario, solo dígitos | `proveedores_cci_formato`: `^[0-9]{20}$` |
| `celular_billetera` | Celular al que se yapea/plinea, sin +51 | `proveedores_celular_billetera_formato`: `^9[0-9]{8}$` |
| `billeteras` (`text[]`) | Qué app abrir: `{yape}`, `{plin}` o `{plin,yape}` | `proveedores_billeteras_validas`: 1–2 elementos, solo `yape`/`plin` |
| `titular_cuenta` | El nombre que muestra el banco/Yape antes de confirmar | `proveedores_titular_largo`: 2–120 caracteres |

Más un quinto candado, `proveedores_billetera_coherente`: hay celular si y solo si hay app. Un celular sin saber de qué
app, o una app sin número, no puede existir (principio 2: el estado imposible se impide en el esquema, no en la
pantalla). `billeteras` existe aparte de `forma_pago_preferida` porque esta guarda una *preferencia* (una sola) y no cubre
«tiene Yape y Plin».

`titular_cuenta` es el control anti-error más barato: quien paga compara el nombre que le muestra el banco con este antes
de confirmar. Es uno solo para el CCI y la billetera; si un proveedor tiene dos titulares distintos, se anota el de la
cuenta principal (ver «Riesgos»).

**D2 — Se escribe por UNA RPC nueva, solo líder: `guardar_cuentas_proveedor`.**
`guardar_cuentas_proveedor(p_proveedor_id uuid, p_cci text, p_celular_billetera text, p_billeteras text[], p_titular_cuenta text)`,
`security definer`, primera instrucción `fn_es_lider()`, `revoke` a `public` y `anon`, `grant` solo a `authenticated`.
Es **reemplazo completo** de las cuatro columnas (`NULL` = vaciar): un solo camino, sin «medio actualizado» posible.
La RPC normaliza (quita espacios, puntos y guiones del CCI; quita `+51` del celular; deduplica y baja a minúsculas las
billeteras) y responde con mensajes en el idioma de la tienda («El CCI tiene que ser de 20 dígitos. Si solo tienes el
número de cuenta, va en “Cuenta”»). Una sola validación viva en un solo lugar (principio 3).

**D3 — `registrar_proveedor` y `actualizar_proveedor` NO cambian de firma.** Ya tienen 9 y 10 parámetros, y agregar
parámetros con `create or replace` deja **dos sobrecargas vivas** (bug ya vivido en esas mismas funciones,
`20260918071000`). La lección de la memoria del proyecto —reescribir una función de producción parte de su definición
real— pesa doble sobre las dos funciones más frágiles del módulo. Costo aceptado: registrar un proveedor y cargar su
cuenta son dos llamadas a la base, no una.

**D4 — `fn_proveedores()` trae las cuatro columnas, al final.** Su cuerpo es el de **producción**
(`pg_get_functiondef`, md5 idéntico al local antes de cambiarla) más `cci, celular_billetera, billeteras, titular_cuenta`
al final del `RETURNS TABLE`, del `select` y del `group by`: pasa de 24 a **28 columnas**. Se hizo `drop` + `create` en la
misma migración (cambia el `RETURNS`; sin el `drop` quedarían dos firmas vivas), y la migración se ensayó completa en una
transacción revertida contra producción antes de aplicarla. Se verificó después: una sola firma de `fn_proveedores` y de
la RPC nueva, nada en `public`, EXECUTE solo `authenticated`.

**D5 — `cuenta_bancaria` no se toca; `telefono` no se copia.**
`cuenta_bancaria` sigue existiendo y pasa a significar «cuenta local» (depósito o mismo banco), lo dice su comentario de
columna; el interbancario vive en `cci`. El backfill copia a `cci` **solo** un `cuenta_bancaria` de exactamente 20 dígitos
(ninguna cuenta local de banco peruano tiene 20: es un CCI sin ambigüedad); en producción no copió nada porque no había
ninguna cuenta cargada. `telefono` **no** se copia a `celular_billetera`: adivinar un destino de dinero es peor que
dejarlo vacío; con 2 proveedores se carga a mano en un minuto. Consecuencia visible y buscada: desde ahora `telefono` se
rotula «WhatsApp», no «Yape / Plin».

**D6 — Regla de negocio: un proveedor con medio de pago preferido EFECTIVO no se marca «sin datos de pago».**
`sinDatosDePago()` (`apps/web/lib/proveedores-reglas.ts`) es una función pura: si `forma_pago_preferida = 'efectivo'` no
hay nada que cargar y no se le muestra la alerta ni cuenta en el filtro «Sin datos de pago». Para cualquier otro medio,
sin cuenta local, CCI ni celular de billetera sí se marca. El **N.° de operación** de un pago sigue siendo **opcional**
(como ya era): no se vuelve obligatorio por este cambio.

**D7 — La visibilidad de estos datos NO cambia ahora.** Las cuatro columnas nuevas se leen igual que `banco` y
`cuenta_bancaria` (D-27: `proveedores_select` a cualquier sesión). Felipe decidió (2026-09-19) que la restricción por rol
«se hará como parte final cuando esté casi todo el proyecto hecho». Queda escrita una regla para que esa decisión no se
haga a medias: **las cinco columnas de pago —`banco`, `cuenta_bancaria`, `cci`, `celular_billetera`, `titular_cuenta`— se
cierran juntas o ninguna.** Esta decisión no agrava la clase de exposición; la hace cuatro columnas más ancha (ver «Riesgos»).

**D8 — Web (este PR).**
- `components/CuentasProveedor.tsx`: tarjeta compartida «Paga por», con «Ver completos» (los números se muestran enmascarados)
  y «Copiar». Una sola pieza para todas las pantallas de abajo: no pueden mostrar cosas distintas.
- `ProveedorModal`: bloque «Cómo pagarle» — CCI con formato y el banco **deducido de los tres primeros dígitos** del CCI
  (`bancoDeCci`), celular con Yape/Plin, titular. Guarda con `guardar_cuentas_proveedor`.
- Ficha del proveedor: tarjeta «Datos para pagar». Lista: chip «Sin datos de pago» y filtro.
- `PagoJuntosModal` y el pago individual muestran la tarjeta en lugar de rotular el WhatsApp como Yape. `LineasPago` avisa
  el destino según el medio elegido. `CompraFormV2` avisa «Sin CCI cargado» / «Sin Yape/Plin cargado».
- Reglas puras con pruebas (`apps/web/lib/proveedores-reglas.ts` + `.test.ts`): normalizar y dar formato al CCI y al
  celular, enmascarar, validar, `bancoDeCci`, `billeterasTexto`, `datosPagoDe`, `sinDatosDePago`, `cuentaLocalVisible`
  (muestra `cuenta_bancaria` solo si su versión «solo dígitos» difiere de `cci`, para no repetir el mismo número dos veces).

## Alternativas descartadas

| Alternativa | Qué ganaba | Por qué no |
|---|---|---|
| **Tabla aparte solo-líder** (`proveedor_cuentas`) para los datos de pago | Cerraría la lectura a los integrantes ya, de raíz | `compras_resumen` es `security_invoker` y lee `p.cuenta_bancaria` con el rol del usuario; esconder columnas con `revoke select (col)` rompería el detalle de compras **para todos, líder incluido**. La salida limpia mueve también `banco`/`cuenta_bancaria` y toca más de un módulo: es la decisión de D-27, de Felipe, para el final del proyecto (D7). Hacerlo solo para las columnas nuevas dejaría dos regímenes de acceso para el mismo tipo de dato. |
| **`tipo_cuenta`** (ahorros/corriente) | Más completo | Una transferencia por CCI no lo necesita y la app del banco lo resuelve sola; una columna que nadie usa es una columna que se llena mal. |
| **Índice único sobre `cci`** | Impediría duplicados | Un mismo dueño puede tener dos fichas legítimas (dos razones sociales, una sola cuenta). Un candado que bloquee un caso real es peor que una consulta de duplicados que avise. |
| **Copiar `telefono` a `celular_billetera`** en el backfill | Cargaba las cuentas sin esfuerzo | El WhatsApp y la billetera suelen ser números distintos; confundirlos es plata mal enviada. Adivinar un destino de dinero es peor que dejarlo vacío (D5). |
| **Sumar parámetros a `registrar_proveedor` / `actualizar_proveedor`** | Un solo guardado en el formulario | Ya tuvieron un bug de sobrecarga doble; `create or replace` con otros parámetros deja dos firmas vivas. Un propósito, una RPC (D3). |
| **Un solo campo «datos de pago» de texto libre** | Cero esquema | Es el estado del que venimos: un texto al que la pantalla le pone el rótulo que quiere. |
| **Hacer obligatorio el N.° de operación** | Más trazabilidad | Se decidió que siga opcional (Felipe): un pago en efectivo o una operación sin comprobante no tiene número. |

## Qué se probó

- **Base:** `scripts/pruebas/proveedores_cuentas_pago.mjs` (`pnpm pruebas:proveedores-cuentas`) — 28 casos en verde en el
  Postgres local, cada uno con `ROLLBACK`.
- **Lógica pura:** `apps/web/lib/proveedores-reglas.ts` con sus pruebas en `proveedores-reglas.test.ts`.
- **Producción, antes de aplicar:** la migración completa se ensayó en una transacción revertida contra la base real.
  **Después de aplicar:** 16 columnas en `retail.proveedores`, los 5 candados presentes, una sola firma de `fn_proveedores`
  y de `guardar_cuentas_proveedor`, nada en `public`, EXECUTE solo `authenticated`. En producción hay 2 proveedores y el
  backfill no copió nada.
- **No cubierto por prueba automática:** las pantallas (modal, ficha, tarjeta, avisos de pago).

## Consecuencias

- Pagar deja de depender de un rótulo adivinado: el destino, la app y el titular están a la vista antes de confirmar.
- `cuenta_bancaria` queda con dos significados en la historia (antes «CCI o cuenta», ahora «cuenta local»). En proveedores
  donde alguien ya pegó un CCI de 20 dígitos ahí, el backfill lo copió a `cci` y la UI evita mostrarlo dos veces
  (`cuentaLocalVisible`). Anular la copia vieja es opcional y de Felipe.
- El diccionario de datos (`docs/datos/generado/`) **no** incluye las 4 columnas hasta refrescar el volcado de producción
  (`docs/datos/generado/COMO-REFRESCAR.md`); no se editó a mano.
- Frágil por diseño y con nombre: `fn_proveedores()` se recreó muchas veces en pocos días (`drop` + `create`); cualquier
  migración futura que la toque debe partir del `pg_get_functiondef` de producción, no de este archivo.

## Riesgos

1. **No hay bitácora de cambios de cuenta (riesgo residual abierto).** Solo el líder escribe, pero un líder o una sesión
   comprometida puede cambiar un CCI justo antes de un pago y nadie sabría quién ni cuándo. Es el hueco de fraude más
   barato de este diseño. Recomendado como siguiente paso, **antes de que haya volumen de pagos** (ver abajo).
2. **Datos personales de un tercero.** El CCI y el celular de billetera de un proveedor persona natural son dato personal
   (Ley 29733), no de CAYLA. Hoy los lee cualquier sesión (D-27) hasta que se cierre la visibilidad (D7); la tarjeta los
   muestra enmascarados por defecto, pero eso es UI, no candado (la API los devuelve completos).
3. **Un solo titular** para CCI y billetera: si un proveedor tiene la cuenta a nombre de una persona y el Yape a nombre de
   otra, el campo no lo expresa. Con 2 proveedores no es un problema real; si aparece, es una decisión nueva.

## Qué queda pendiente

- [ ] **Visibilidad por rol de las 5 columnas de pago** — decisión final del proyecto (Felipe: «como parte final cuando
      esté casi todo el proyecto hecho»). Se cierran juntas o ninguna (D7). Requiere resolver antes que
      `compras_resumen`/`listar_compras` (que arrastran `proveedor_banco/cuenta_bancaria`) no dependan de leer la columna.
- [ ] **Bitácora de cambios de cuenta:** tabla append-only `proveedor_cuentas_historial` (quién, cuándo, valor anterior
      **enmascarado**), escrita por `guardar_cuentas_proveedor` en la misma transacción. Sin `UPDATE`/`DELETE`.
- [ ] **Anular la copia duplicada de `cuenta_bancaria`** donde ya hay el mismo número en `cci` (opcional, decisión de
      Felipe; no se hace: no se borran datos con historial).
- [ ] Refrescar el volcado de producción para que el diccionario incluya las columnas y la función nuevas
      (`pnpm datos:generar:produccion`, según `docs/datos/generado/COMO-REFRESCAR.md`).
- [ ] Cuando la web se fusione: cargar a mano el CCI/celular/titular de los 2 proveedores reales.
