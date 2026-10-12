# ADR-0382 — Lo que SUNAT aceptó no retrocede, y lo que pudo llegar no se libera

- **Fecha:** 2026-10-12 · **Estado:** construido y verificado en local (una base desechable propia, ver «Verificación»). **Sin pegar en
  producción**: necesita el OK puntual de Felipe.
- **Pedido:** revisión de «Transmisión a SUNAT: un segundo envío o una respuesta tardía no debe pisar un comprobante aceptado». Felipe, con el
  diagnóstico a la vista: «Opción A y avanza con la Parte 1 en local».
- **Complementa** a [ADR-0378](0378-lucode-ya-tiene-el-numero.md) (PR #970: «ya emitido» se confirma con el XML de Lucode, solo web). Aquel
  arregla la cola atascada; este hace que la base no deje retroceder lo que SUNAT ya respondió, venga de donde venga.

## El problema (producción, solo lectura, 2026-10-12)

- `actualizar_transmision_comprobante` escribía **cualquier estado sobre cualquier otro** (huella `2614dff1…`, igual en el repo, en local y en
  producción). Dos respuestas de Lucode del mismo comprobante leían las dos el estado de antes y la última en llegar ganaba.
- **Reproducido** con dos conexiones reales en una base desechable: con la aceptación guardándose, una respuesta vieja («ya emitido», que
  llega como rechazo) dejó la boleta en `rechazado` encima del `aceptado`.
- **En producción no ha pasado:** de 489 comprobantes con respuesta ACEPTADO, todos están `aceptado` o `anulado`. No pasaba porque la web
  tenía cuidado (el «ya emitido» llega como error y `fn_marcar_reintento_transmision` sí se niega a tocar un aceptado), no porque la base lo
  impidiera. Con el ADR-0378, más caminos escriben por esta función.
- Lo que la revisión temía y **no ocurre**: una doble declaración. Lucode rechaza un número de boleta que ya tiene («fue emitido
  anteriormente»); el riesgo real es que el ERP muestre un estado falso.

## Decisión 1 — la respuesta vieja se ignora y el mapa de pasos vive en la tabla (`20261012180000`)

1. `actualizar_transmision_comprobante` lee la fila **y la bloquea** (`for update`): la segunda respuesta espera a la primera y decide con lo
   que esta dejó escrito. Si el comprobante ya está `aceptado` (o `anulado`, que viene después), la respuesta es vieja y **se ignora sin
   error**. Misma firma y mismos permisos: la web no cambia.
2. Un disparador sobre la tabla, `comprobantes_estado_no_retrocede`, con los únicos pasos que existen:

   | Desde | Puede pasar a | Quién lo hace |
   |---|---|---|
   | `pendiente`, `pendiente_reintento` | `pendiente_reintento`, `enviado`, `aceptado`, `rechazado`, `no_emitido` | el envío, la cola, «Liberar» y anular la venta |
   | `interna` (nota de venta) | `no_emitido` | anular la venta |
   | `enviado`, `rechazado` | `enviado`, `aceptado`, `rechazado` | la consulta y el reenvío tras corregir |
   | `aceptado` | `anulado` | la baja ante SUNAT |
   | `anulado`, `no_emitido` | nada | — |

   Cubre a las seis funciones que hoy cambian el estado y a cualquier escritor futuro o a mano, no solo a esta RPC.

**Descartado:**

- *Rechazar con error toda respuesta que retrocede (lo que proponía la revisión).* Que dos respuestas se crucen es normal (SUNAT lenta, dos
  pestañas). Con error, `transmitirComprobante` anotaría «Lucode transmitió pero no se pudo guardar» y mandaría una alerta al registro de
  errores por algo que salió bien; alertas falsas enseñan a ignorar las verdaderas. El disparador sí rechaza, porque lo que llega a él no es
  una carrera sino un paso que no existe (SUNAT acepta algo que el ERP ya liberó), y eso tiene que verse.
- *Reservar la fila antes de llamar a Lucode y responder 409 si otro la tomó.* `proximo_reintento_at` ya hace de reserva **y** de espera
  entre reintentos: si «Reintentar ahora» la respetara, quedaría bloqueado justo cuando se necesita, y separarlas pide una columna nueva. Con
  esta decisión y el ADR-0378, un doble envío cuesta una llamada extra a Lucode y termina con el estado correcto.
- *Preguntar a Lucode antes de reenviar.* Lo resuelve el ADR-0378 de otra forma (reenvía y, si Lucode dice «ya emitido», confirma con el XML).

**Se rompe si** hace falta un paso nuevo legítimo (p. ej. volver a abrir un comprobante liberado): necesita su propia migración que lo
agregue al disparador, a propósito.

## Decisión 2 — anular una venta no libera lo que pudo llegar a SUNAT (`20261012180100`, opción A de Felipe)

`anular_venta` liberaba (`no_emitido`) también el comprobante en la cola de reintento (`20260922151500`), suponiendo que lo de la cola «nunca
se transmitió con éxito». El ADR-0378 mostró lo contrario: de 52 en la cola de producción, 41 ya estaban en SUNAT. Anular una de esas ventas
dejaba una venta declarada y devuelta a quien compró, sin nota de crédito, con el número dado por libre. Además, «Liberar sin espera» ya solo
liberaba un `pendiente`: dos puertas decían cosas distintas sobre lo mismo.

Ahora, si el comprobante de la venta tuvo **algún intento** de envío, la venta no se anula y la base lo dice con el número:

> El comprobante B001-13 de esta venta ya se intentó enviar a SUNAT y pudo haber llegado, así que la venta no se anula. En Comprobantes ▸ Por
> enviar pulsa «Reintentar ahora»; cuando figure aceptado, usa Devolución (sale con su nota de crédito).

Lo que nunca intentó salir (`pendiente` sin intentos, la nota de venta `interna`) se sigue liberando como siempre. El disparador de la
decisión 1 lo hace cumplir para cualquier escritor: `no_emitido` solo desde `pendiente` o `interna` y con cero intentos. La pantalla no cambia:
ya muestra el mensaje de la base tal cual.

**Corrección a lo que se le dijo a Felipe al elegir.** El plan decía que, tras «Reintentar ahora», «si no llegó, se puede anular». No es así:
«Reintentar ahora» **envía** el comprobante si Lucode no lo tiene, así que en los dos casos termina `aceptado` y el camino es Devolución con
nota de crédito. Una venta cuyo comprobante intentó salir ya no se anula nunca. Para el negocio la diferencia es un papel más (la nota de
crédito) en un caso raro y del mismo día; a cambio, ninguna venta declarada queda sin su nota.

**Descartado:**

- *B: preguntarle a Lucode desde la pantalla de anular, antes de anular.* Anularía al momento lo que de verdad no llegó, pero la regla viviría
  en la web y cualquier otro camino (una RPC futura, un script) se la saltaría.
- *C: dejarlo como estaba.* El caso de las 41 quedaba abierto.

**Se rompe si** Lucode está caído cuando la tienda quiere anular una venta cuya boleta ya intentó salir: no se anula hasta que «Reintentar
ahora» la resuelva. Felipe lo aceptó al elegir la opción A.

## Verificación

- `pnpm pruebas:sunat-estado-no-retrocede` (al CI, todo en ROLLBACK): **3/12 sin la decisión 1, 12/12 con ella**; con el caso de la
  decisión 2, **12/13 sin ella y 13/13 con las dos** (respuesta vieja tras aceptar y tras anular, pasos de siempre, ocho pasos imposibles por
  update directo, mismo estado sin disparador).
- `pnpm pruebas:venta-contrato-ampliado`: el caso que fijaba la regla vieja (anular liberaba lo de la cola) ahora espera la negativa, el
  mensaje con el número y nada cambiado; falla sin la decisión 2 y pasa con ella.
- `pnpm pruebas:sunat-estado-no-retrocede-concurrencia` (dos conexiones con COMMIT; solo con `BASE_DESECHABLE=1`): en una base desechable
  (contenedor propio con la misma imagen de Supabase y una copia de `retail` y `public` de la base local), **2/3 sin la migración** (la
  carrera pisa el aceptado) y **3/3 con ella**. La migración se aplicó dos veces seguidas sin error (re-ejecutable).
- 19 suites que tocan comprobantes, ventas anuladas, notas, separaciones, cola de arranque e impuestos: **los mismos resultados antes y
  después** de aplicar la migración en la desechable. No se aplicó a la base local compartida: otras sesiones y el espejo de
  `/flujo-de-negocio` cuentan con ella tal cual.

## Producción

Dos pegados, en orden, cada uno de una vez: sin políticas ni `drop trigger`, con `lock_timeout` de 3 s, re-ejecutables.

1. `20261012180000`: antes de reemplazar la función comprueba su huella (`2614dff116d42705bcf9fd85bafa0720`) y se detiene si alguien la cambió.
2. `20261012180100`: se detiene si falta el disparador del paso 1. Reemplazo anclado de `anular_venta` (huella en producción
   `7eec68a5d7d9aa95ef21c8a045a2ad8e`; consultado el 2026-10-12: cada ancla aparece exactamente una vez).

Después:

```sql
select count(*) from retail.comprobantes
 where respuesta_sunat->>'estado' ilike 'aceptado' and estado not in ('aceptado', 'anulado');  -- 0, igual que hoy
select tgname from pg_trigger where tgrelid = 'retail.comprobantes'::regclass and tgname = 'comprobantes_estado_no_retrocede';
```
