# ADR-0541 — Una campaña que solo tiene ofertas también sale en la Tienda web

- **Fecha:** 2026-10-27 · **Estado:** aceptado (Felipe eligió el % de la portada el 2026-10-27). Código y prueba en la rama
  `claude/campanas-tienda-catalogo-42d8de`. **La migración `20261027221000_campana_con_ofertas_en_tienda_web.sql` se pegó en producción el 2026-10-27** (Felipe lo ordenó; una sola
  parte, con la guarda de md5). También está en el Postgres **local**.
- **Relacionados:** ADR-0496 (las ofertas de una campaña: «Lo que NO cubre» es este pendiente), ADR-0471 (Tienda web ▸ Campañas), ADR-0476 (la
  llave de las campañas), ADR-0408 (la tienda online y su puerta `retail.tienda_*`), ADR-0486 (campañas por sede), ADR-0370 (reemplazos
  anclados), ADR-0195 (políticas y deadlocks), ADR-0288 (el SQL Editor y `select … into`).

## El problema

Desde el 2026-10-23 una campaña ya no guarda su descuento en `etiquetas.descuento_pct`: lo arma con **ofertas** (`retail.campana_reglas`). La caja
las lee (`fn_campanas_en_sede`) y cobra bien. Pero cuatro funciones de la Tienda web seguían exigiendo `descuento_pct > 0`: `fn_campana_web_valida`
(la lista de Tienda web ▸ Campañas y quién puede diseñar), `tienda_portada` (lo que anuncia la portada), `tienda_diseno_campana` (el diseño que pinta
la tienda) y el `pct` de `fn_campana_web_fila`. Consultado en producción el 2026-10-27 (solo lectura): las tres primeras exigían el descuento
directo y ninguna miraba `campana_reglas`.

Lo vio Felipe probando en local: «Día del perro» con 1 oferta y «sin descuento» cobraba en caja y no salía en Tienda web ▸ Campañas. Y lo había
dejado escrito ADR-0496: «Una campaña con solo ofertas cobra bien en caja pero puede no salir en esas pantallas».

## Lo que se decidió

1. **La lista (Tienda web ▸ Campañas) acepta una campaña con descuento de siempre O con al menos una oferta `activa`**, de cualquier fecha: la
   lista también muestra las que van a empezar y las que terminaron hace menos de 120 días, y el líder tiene que poder diseñarla antes. Un
   borrador o una oferta retirada **no** cuenta (nunca cobra).
2. **La portada anuncia lo que cobra HOY.** Cuenta una oferta activa que rige hoy (misma regla de la caja: `fn_regla_rige_en`, fechas y día de la
   semana). El % es **el mayor entre el descuento de siempre y las ofertas que rigen hoy** (Felipe, entre «el mayor activo hoy» y «un texto sin %»):
   el cliente nunca ve un número menor al que luego paga. El «hasta» (la cuenta regresiva) es el de lo que da ese %: el de la campaña si gana el
   descuento de siempre (o empatan), el de la oferta si gana ella.
3. **Una sola ganadora.** `fn_campana_portada()` es LA definición de qué campaña gana la portada, y la leen `tienda_portada` y
   `tienda_diseno_campana`. Antes cada una repetía la consulta, y la tienda aplica el diseño solo si el nombre coincide con el de la portada.
4. **Sin ofertas, nada cambia:** mismo orden (termina primero, mayor %, nombre), mismo % y mismo «hasta». La forma de lo que devuelven
   (`{campana: {nombre, pct, hasta}}`, `{campana: {nombre, diseno}}`) es la misma.
5. La portada pide que la campaña tenga prendas: marcadas, por categoría o —como la caja— de las categorías «solo estas» de una oferta que rige hoy.

## Descartado

- **Un texto genérico sin % cuando solo hay ofertas** («Ofertas por el Día del Perro»): más simple y nunca desactualizado, pero pierde el «−20 %»,
  que es lo que atrae. Felipe eligió el mayor % activo hoy.
- **Contar el borrador:** un borrador nunca cobra; la tienda anunciaría un descuento que la caja no da.
- **Que el día de la semana cuente también en la LISTA del ERP:** el líder necesita ver y diseñar la campaña un miércoles aunque su oferta sea de martes
  y jueves. En la portada sí cuenta.
- **Pegar la misma consulta nueva en las dos funciones de la tienda:** dos copias que se desfasan (el diseño dejaría de coincidir con la campaña de la portada).
- **Un reemplazo anclado de una línea:** las cuatro funciones son cortas (de 6 a 30 líneas) y producción tiene exactamente el texto del repo; se reescriben
  completas, con una guarda de md5 que se niega a pisar una versión que alguien cambió a mano.

## Cómo se hizo

- `retail.fn_campana_oferta_hoy(etiqueta, hoy)` (la mejor oferta que rige hoy) y `retail.fn_campana_portada()` (la ganadora): internas, `security definer`,
  sin permiso para `public`, `anon` ni `authenticated`.
- `fn_campana_web_valida`, `fn_campana_web_fila`, `tienda_portada` y `tienda_diseno_campana` se reescriben con `create or replace` (los permisos y
  comentarios de las dos últimas se conservan). Solo `create or replace` de funciones: ni `alter` de tablas en uso, ni políticas, ni triggers. Se pega de una vez.
- Guarda al principio: cada una de las cuatro funciones vivas tiene que ser la de producción del 2026-10-27 (md5) o esta misma; si no, no aplica nada.

## Lo que NO cubre (queda en el backlog)

- **Las sedes:** la portada no tiene tienda, igual que antes con el descuento de siempre. Una campaña u oferta limitada a una tienda se anuncia en la
  portada de todas (ADR-0486).
- **Los otros lectores del descuento directo**, ya listados en ADR-0496: `campana_detalle`, el reporte de Finanzas (`fn_campanas_reporte`),
  `fn_configuracion_tiendas` y las copias en TypeScript (`lib/precio-de-hoy.ts`, `lib/etiqueta-campana.ts`).
- **La tarjeta «Lo que ya tiene» de Insignias** sigue diciendo «Descuento: sin descuento» en una campaña que solo tiene ofertas (el descuento de siempre
  no existe y las ofertas tienen su propia fila «Ofertas»). Es un texto, no un dato mal leído; decidir si se funden en uno es de Felipe.

## SE ROMPE SI

Alguien reescribe `tienda_portada` o `tienda_diseno_campana` con una consulta propia (vuelven a pasar dos copias y el diseño no coincide con la
campaña de la portada), o si `fn_regla_rige_en` cambia sin avisar a la caja y a la tienda a la vez (la tienda anunciaría una oferta que la caja no cobra).

## Verificado

`pnpm pruebas:campana-con-ofertas` (32 escenarios en el Postgres local, cada uno en su transacción con ROLLBACK): la lista (sin descuento ni ofertas
no; oferta activa sí; borrador y retirada no; por empezar y de otro día sí; el % es el mayor), la portada (rige hoy, borrador, retirada, empieza mañana,
otro día de la semana, dos ofertas, descuento de siempre contra oferta con su «hasta», sin prendas, «solo estas categorías», gana la que termina
primero), el diseño sale de la misma campaña que la portada, **sin ofertas portada, diseño y lista dan lo mismo antes y después de la migración**
(sobre las campañas reales de la base), la migración dos veces seguidas, la guarda contra una función cambiada a mano y los permisos.
Con la migración puesta en el local siguen en verde `campanas-web` (101/101), `campana-reglas` (73/73), `tienda-puerta` (36/36),
`campanas-llave-unica` (27/27) y `campanas-por-sede` (18/18). En local, la campaña real «Dia del perro» (20 %, hasta el 29-oct) ahora sale en la portada.

## Sin verificar

Producción: pegada el 2026-10-27. La guarda de md5 pasó; `select retail.tienda_portada();` y `tienda_diseno_campana()` dieron `{"campana":null}`, igual que antes (ninguna campaña de producción tiene hoy descuento ni ofertas que rijan); las 6 funciones quedaron con el texto nuevo, `tienda_web` ejecuta las dos públicas y `anon`/`authenticated` no ejecutan las internas. Falta mirar la tienda real en un navegador cuando exista una campaña con ofertas. `tienda_ficha` 47/48 en local:
el escenario de fotos falla por una foto principal duplicada de los datos locales, ajeno a este cambio.

**Nota de pruebas en local.** Las suites `campanas-web`, `campanas-por-sede` y `tienda-ficha` suponen una base SIN campañas con ofertas; con una campaña
real que tiene ofertas activas (como «Dia del perro») fallan por datos, no por lógica (en el CI, con la base del seed, pasan).
