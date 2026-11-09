# ADR-0632 — El vigía diario de invariantes: producción se revisa sola cada madrugada y avisa solo lo nuevo

- **Fecha:** 2026-11-09 · **Estado:** construido en la rama `claude/system-audit-improvements-069230` (5 commits). La migración
  `20261109152000_vigia_de_invariantes.sql` **no está pegada en producción**: la pega Felipe (ver «Cómo se pega»).
- **Nace de:** el problema #8 de la auditoría del 2026-11-09 («Nadie vigila la salud del negocio en producción»). Felipe: «empieza por el 8,
  pero utiliza las skills que consideres apropiadas empezando por ultra criterio».
- **Relacionados:** ADR-0356 (`/chaos` y sus invariantes), ADR-0450 (`/api/salud` y su vigía), ADR-0424 (Sentry), ADR-0322 (el Observatorio
  del Admin), ADR-0166, ADR-0352 y `20261006110000` (descartan `pg_cron`: la casa programa con Vercel Cron).

## El problema

`scripts/chaos/invariantes.mjs` sabe 28 estados que el negocio declara imposibles y que la base no impide sola: el stock que no cuadra con la
suma de `movimientos`, la venta cuyos pagos no suman sus líneas, la boleta que no suma lo que la venta, la caja cerrada que no cuadra su
diferencia… Pero solo los miraba en la base **local**, durante un ataque de `/chaos`. Producción nunca se miraba, y producción se cambia a
mano en el SQL Editor casi a diario (256 migraciones nuevas en los 14 días al 2026-11-09). Un parche que hiciera que las devoluciones de AQP
no devolvieran el stock no daría error en ninguna pantalla: se notaría semanas después en un conteo, sin saber desde cuándo ni por qué.

## Decisión

DECIDÍ: un vigía que vive en la base y corre solo.
1. **Las invariantes como datos** (`retail.invariantes`), sembradas desde `invariantes.mjs`: una sola definición. La siembra no se escribe a
   mano (`scripts/chaos/vigia-semilla.mjs` la genera) y `vigia-semilla.test.mjs` falla si la última migración que siembra no es igual a lo que
   sale hoy del detector.
2. **Comparar por identidad, no por fila.** Cada invariante declara su `clave` (la venta, la caja, la prenda en su sede): una violación
   abierta cambia de cifras cada día y, comparada por fila entera, volvería «nueva» cada mañana. La huella es el md5 de la clave.
3. **Lo que ya se sabía no despierta a nadie.** La primera corrida de cada invariante fija su línea base (`heredada`); el Admin puede aceptar
   algo con su motivo (`aceptada`). **Lo conocido se retira cuando desaparece** (`resuelta_en`): si algo arreglado se vuelve a romper, cuenta
   otra vez como nuevo. Lo encontró la lente de conjuntos de `/rigor`: sin retirar, una falla que vuelve quedaba escondida para siempre.
4. **Lo que no se pudo mirar nunca es «limpia»:** sale `error` (con su motivo) u `omitida` (apagada, o que necesita una sesión que el
   trabajo programado no tiene: INV-09, los asientos, que ya avisa en rojo el Estado de resultados).
5. **Las sospechas nacen apagadas** (`activa = false`: el posible doble cobro y el movimiento repetido). Son heurísticas que a veces están bien
   y «un freno con ruido se desactiva en una semana y enseña a ignorar a los demás» (curso Ultra criterio, regla 12). Siguen en `/chaos`.
   Cada invariante tiene ese interruptor en la base: si una hace ruido, se apaga sin publicar nada, y una siembra nueva no la vuelve a encender.
6. **Vercel Cron a las 3:30 de Lima** (`/api/salud/invariantes`, `CRON_SECRET`, llave de servicio), como los demás trabajos programados.
   Avisa a Sentry con conteos e ids de invariante, nunca una fila.
7. **El aviso llega a donde Felipe mira:** una lente más del Observatorio del Admin («Vigía de la base»): «La base cuadra», «N problemas
   nuevos» con cuáles son en palabras, «El vigía no corre» a las 26 h (urgente: un vigía detenido no avisa de nada), o «?» si no se pudo leer.

DESCARTÉ:
- **Correr `invariantes.mjs` desde GitHub Actions contra producción:** la clave de la base iría a un repositorio público, cuyos registros de
  Actions también son públicos.
- **`pg_cron`:** el repo no lo usa en ningún lado, tres decisiones lo descartaron y habría que habilitar la extensión. La auditoría del
  2026-11-09 decía «pg_cron ya se usa» por un revisor que no lo verificó: era falso, y se corrigió.
- **Prevenir con disparadores en vez de detectar:** tocaría las funciones que escriben (`registrar_venta` y las demás) y no cubre el riesgo
  mayor, lo que se pega a mano en el SQL Editor como `postgres`. Donde prevenir es barato (un índice único) se hará aparte, midiendo antes.
- **Un tope de tiempo por invariante dentro de la función:** Postgres no corta una consulta que ya corre porque una función cambie
  `statement_timeout`; sería un tope de mentira. Si una se vuelve lenta, cae la corrida entera y el aviso lo dice.
- **Avisar por un issue de GitHub:** la alarma de deriva lleva 43 de 43 días en rojo en ese canal sin que nadie la mire. Un guardián
  instalado no es un guardián usado.

SE ROMPE SI: el trabajo programado deja de correr (se borra `CRON_SECRET`, Vercel lo pausa) y nadie abre el Observatorio en días; o alguien
cambia una consulta en `invariantes.mjs` y pega la migración nueva **antes** que la vieja (la siembra sigue a la última por nombre); o una
clave queda mal escrita y no hay ninguna fila que la delate (sale «error» recién el día que algo se rompe; antes la ataja el CI).

## Números

Volcado de producción del 2026-11-06: ~9 mil movimientos, ~1.900 ventas, ~1.900 comprobantes, ~5 mil filas de stock, en ~7 semanas de uso
real. A ese ritmo son del orden de 200 mil movimientos en 3 años: sumar por prenda y sede toma milisegundos. 28 filas de corrida por día
son ~10 mil en 3 años. No hace falta índice ni caché.

## Premortem (imaginar que falló en seis meses y decir por qué)

1. **Nadie lo miró:** la lente estaba en rojo y Felipe se acostumbró. → Solo es urgente un estado imposible nuevo; lo heredado y lo aceptado
   no cuentan; las sospechas están apagadas.
2. **Dijo «limpia» sin haber mirado:** una consulta rompió tras un cambio de esquema. → `error` nunca es `limpia` (probado con mutación).
3. **Escondió una falla que volvió:** → lo conocido se retira cuando desaparece (probado con mutación).
4. **Dejó de correr en silencio:** → «El vigía no corre» a las 26 h, y el 500 de la ruta va a Sentry.
5. **Se separó del detector:** → `vigia-semilla.test.mjs` en el CI.

## Lo construido

| Pieza | Archivo |
|---|---|
| Clave de identidad en las 28 invariantes | `scripts/chaos/invariantes.mjs` |
| Generador de la siembra y su prueba (incluye la anti-deriva) | `scripts/chaos/vigia-semilla.mjs`, `vigia-semilla.test.mjs` (en el CI) |
| Tablas, funciones y siembra | `supabase/migrations/20261109152000_vigia_de_invariantes.sql` |
| Prueba en Postgres (20 casos, con mutación) | `scripts/pruebas/vigia_invariantes.mjs`, `pnpm pruebas:vigia-invariantes` (en la tanda del CI) |
| Trabajo programado | `apps/web/app/api/salud/invariantes/route.ts`, `vercel.json`, `lib/rutas-cron.ts` |
| Reglas puras (lectura en el borde, qué se avisa, la lente) | `apps/web/lib/vigia-invariantes-reglas.ts` y su prueba; `vigia-invariantes-ruta.test.ts` |
| La lente del Observatorio | `apps/web/lib/observatorio.ts`; `AvisoObs.href` opcional en `observatorio-reglas.ts` y `components/observatorio/Abajo.tsx` |

## Cómo se pega (Felipe)

Una sola parte, en el SQL Editor de cayla-dynamic: el archivo entero. No tiene `create policy` ni `alter` de tablas en uso; trae su
`set lock_timeout = '3s'`; todo está prefijado con `retail.`; ningún `select … into` dentro de comillas simples (las consultas van entre
`$inv$`). Se puede volver a pegar. Para deshacerlo: `drop function` de `fn_correr_invariantes`, `fn_invariantes_estado` y
`fn_invariantes_aceptar`, y `drop table` de `invariantes_conocidas`, `invariantes_corridas` e `invariantes` (en ese orden).

**Verificar por efectos, solo lectura:** `select count(*) from retail.invariantes;` → 28. Después, en el mismo SQL Editor,
`select retail.fn_correr_invariantes();` fija la línea base al instante (sin esperar a las 3:30) y muestra lo que ya había roto, como
`conocidas`. Si sale algo en `conocidas`, eso es lo heredado: conviene mirarlo, porque es la primera vez que alguien lo cuenta.

**Aceptar algo que es así a propósito** (hasta que tenga botón): `select retail.fn_invariantes_aceptar('INV-02', '<por qué, 10 letras o más>');`

## Lo que queda

- El índice único de «un comprobante vivo por venta» (INV-06): primero medir producción con la sonda de la auditoría.
- Un botón «Aceptar» en el detalle de la lente (hoy, por SQL Editor).
- INV-09 (asientos): o `fn_diario` acepta la llave de servicio, o se queda al Estado de resultados.
- La alerta de Sentry que escriba a Felipe con el `donde` «salud/invariantes».
