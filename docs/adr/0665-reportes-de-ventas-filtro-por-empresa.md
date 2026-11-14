# ADR-0665 — Reportes de ventas: el filtro «Empresa» (CAYLA / CLAURE) donde conviven dos

- **Fecha:** 2026-11-14 · **Estado:** construido y probado en local (27 casos de Postgres nuevos, las pruebas del reporte de siempre —46 y 28— en verde, el recorrido en el navegador en escritorio y a 375 px). La migración `20261114215000` **está pegada en producción desde el 2026-11-14** (la pegó Felipe; la consulta de verificación dio las 4 funciones con `p_empresa`, INVOKER y los md5 esperados).
- **Pidió:** Felipe, 2026-11-14: «en el reporte de ventas, cuando sea Lima, debe existir un filtro adicional de CAYLA y Claure».
- **Sigue a:** ADR-0606 (los reportes), ADR-0542 (de quién es cada línea en Lima), ADR-0532 (cómo se reparte el dinero entre las dos empresas), ADR-0505 (CLAURE solo existe en Lima).

## El problema

En Lima las dos empresas venden por la misma caja y la misma boleta (el RUC de CAYLA). Caja, Historial y Movimientos ya dicen cuánto es de cada una (ADR-0532, ADR-0542), pero Ventas ▸ Reportes —el único lugar donde se ve el mes, el ranking de prendas y las tendencias— solo traía una línea que decía «lo vendido incluye S/ 90 de prendas de CLAURE». Para saber cómo le fue a CLAURE en octubre, o qué prenda de CAYLA salió más en Lima, había que restar a mano.

## Decisión

**Una píldora «Empresa · Todas · CAYLA · CLAURE» junto a «Tienda», en las dos pantallas de Reportes, que aparece solo cuando la tienda que se mira tiene dos empresas** (hoy Tienda Lima; la regla es `fn_empresas_de_sede`, no el nombre «Lima»). Con ella puesta, las cifras, los gráficos, la tabla, el ranking y las dos descargas cuentan solo las líneas de esa empresa.

| Pieza | Qué decide | Dónde |
|---|---|---|
| Cuándo se ofrece | Cuando la tienda elegida (el líder) o la propia (quien no es líder) opera dos empresas. Con «Todas las tiendas», en Trujillo o en Arequipa, no se dibuja y `?emp=` se ignora: la URL no estrecha lo que se ve. | `lib/reportes-ventas-alcance.ts`, `lib/reportes-empresa-reglas.ts` |
| La URL | `?emp=claure` (la clave, no un uuid). Cambiar de tienda la quita. | `hrefVentasDelMes`, `hrefRanking` |
| De quién es una línea | La regla de Caja e Historial (`fn_dueno_de_la_linea`): el dueño de la salida de esa línea en `movimientos`; si la venta es anterior al libro, el de la ficha. Escrita como SQL llano INVOKER (`fn_empresa_de_la_linea`) porque las lecturas de Reportes son INVOKER y una función `security definer` por línea las haría ~100 veces más lentas (ADR-0622). | `20261114215000` |
| Vendido y prendas | Lo cobrado (`subtotal`) de las líneas de esa empresa. CAYLA + CLAURE = el vendido sin filtro. | las cuatro lecturas |
| Ventas (tickets) | Las ventas que tienen **al menos una línea** de esa empresa. Una venta mixta cuenta en las dos, así que las ventas de las dos empresas pueden sumar más que las ventas sin filtro. | `fn_reporte_ventas_*` |
| Devuelto | El reembolso de cada devolución aprobada se parte **por el valor de lo devuelto** de cada empresa. Una devolución de una sola empresa va entera; si lo devuelto no tiene valor, a la casa. La suma de las dos es SIEMPRE el reembolso. | `fn_reembolso_de_la_empresa` |
| Cómo se pagó | **No se parte.** Una caja y una boleta son una sola; Felipe ya descartó partir los pagos por empresa (ADR-0532). Con la empresa puesta, el cuadro dice por qué y no dibuja nada. | `GraficosReporteMes` |
| Lo que queda (Ranking) | Las unidades de esa empresa en la tienda: CLAURE sale de `fn_stock_por_dueno`; CAYLA es el stock total menos CLAURE. La columna dice «Stock de CLAURE». | `fn_reporte_ventas_ranking` |
| «Incluye CLAURE» y «Cómo cuadra con Finanzas» | Se retiran con una empresa puesta: la cifra ya es de esa empresa y Finanzas cuenta la caja entera. | `page.tsx` |
| La base | `p_empresa uuid default null` al final de las cuatro lecturas. Solo vale dentro de una tienda donde operan dos (22023 si no). Se borran las firmas viejas en la misma transacción (con dos, PostgREST no sabe a cuál llamar). | `fn_exigir_empresa_del_reporte` |

DECIDÍ la píldora y no una pestaña ni un segundo reporte: es la misma pregunta («cómo va lo que miro») con un filtro más, y las pantallas ya viven en la URL.

DESCARTÉ:
- **Ofrecerla también con «Todas las tiendas»** (como el Historial): CLAURE ahí sería «lo vendido en Lima que no es de CAYLA», y CAYLA «todo lo demás»; son dos sumas distintas de las de una tienda y Felipe pidió «cuando sea Lima». Para verla, se elige Lima.
- **Llamarla «Tienda»**, como Movimientos y Catálogo ▸ Productos: en Reportes «Tienda» ya es la sede.
- **Repartir los pagos por empresa en proporción a las líneas:** una estimación en una venta mixta; ya lo descartó Felipe.
- **Llamar a `fn_dueno_de_la_linea` desde las lecturas:** es `security definer` con `search_path` y la web no la ejecuta; por línea es lo lento que ADR-0622 midió.
- **Calcular el reparto en la web:** el ranking viene paginado de la base; un filtro afuera haría mentir a la página.

SE ROMPE SI: `fn_dueno_de_la_linea` cambia su regla y nadie cambia `fn_empresa_de_la_linea` (hoy son dos copias; `pnpm pruebas:reportes-por-empresa` exige que digan lo mismo en TODAS las líneas de la base) · se agrega una tercera empresa a Lima (la píldora y la base ya la ofrecen, pero los textos hablan de dos) · se cambia `fn_vendido_por_empresa` y no las lecturas (la prueba compara el CLAURE y el CAYLA del reporte con los de Caja e Historial).

## Lo que Felipe tiene que mirar (decisiones mías, no suyas todavía)

1. **Las ventas mixtas cuentan en las dos empresas.** Un ticket con una blusa de CAYLA y una de CLAURE es una venta de CAYLA y una de CLAURE; el «Ticket promedio» de cada una es lo que se cobró de ella por cada una de esas ventas.
2. **La devolución mixta se parte por valor.** Es la única estimación del cambio; una devolución de una sola empresa va entera. Hoy hay ~2 devoluciones en total.
3. **La etiqueta es «Empresa».** Es una etiqueta (`FiltrosReporteMes`, `FiltrosRanking`).

## Cómo se pegó en producción (primero la migración, después la web)

Una sola parte, con el prefijo `retail.` y un candado que compara el cuerpo vivo de las cuatro lecturas con el de `main`: si alguien las parchó en vivo, aborta y lo dice. Se puede pegar dos veces. No toma locks de `auth` ni `storage` (hay `drop function`, no hay políticas ni `drop trigger`). Depende de `fn_dueno_de_la_linea` (20261028153000), `fn_stock_por_dueno` (20261027222000) y `fn_empresas_de_sede`, ya en producción. Después, de solo lectura: las cuatro funciones de `fn_reporte_ventas%` deben salir con `p_empresa` y ser INVOKER.

La web manda `p_empresa` **solo** cuando hay una empresa elegida: sin ella la llamada es la de siempre, así que el reporte no depende de que la migración ya esté.

## Verificación

- `pnpm pruebas:reportes-por-empresa` (27/27, Postgres local, cada caso en ROLLBACK): la regla de la línea contra `fn_dueno_de_la_linea` en todas las líneas; CAYLA + CLAURE = sin filtro en cifras, gráficos, cortes y ranking; el mes anterior y la primera venta; la devolución mixta y sin líneas; «cómo se pagó» vacío con empresa; lo que queda (CLAURE 3 y 5, CAYLA 7, suman el «queda» sin filtro); coincide con `fn_vendido_por_empresa`; 22023 sin tienda, en Trujillo o con una empresa que no existe, 42501 sin el módulo; una cuenta de Lima que no es líder lee lo mismo; permisos; una sola firma; la migración dos veces; y el control (sin el movimiento CLAURE saldría 90 y no 130).
- `pnpm pruebas:reporte-ventas-mes` (46) y `pruebas:reporte-ventas-ranking` (28): las de siempre, con la migración nueva pegada después de las viejas.
- Web: `lib/reportes-empresa-reglas.test.ts` y las de URL, pie y descarga; guías (paso nuevo en las dos pantallas, huella aceptada); tipos.
- Navegador (local, con ventas inventadas que se borraron al terminar): con «Todas las tiendas» no hay píldora; con Lima, sí. CLAURE: S/ 90 en 2 ventas y 4 prendas; CAYLA: S/ 140 en 2 y 3; suman los S/ 230 del mes. El pie dice «· CLAURE», «Cómo se pagó» explica por qué no se parte, «Stock de CLAURE», y las dos descargas traen el nombre `…-lima-claure.csv`. `?emp=` con «todas las tiendas» o con una clave que no existe se ignora. A 375 px la píldora baja a su fila.
- **Verificado en producción (2026-11-14, solo lectura, por Felipe):** las cuatro `fn_reporte_ventas%` con `p_empresa`, INVOKER y los md5 de este archivo.
- **No verificado:** con la base de producción, el tiempo de las lecturas con empresa (por línea, sobre un mes de Lima; las lecturas sin empresa no cambian).

## Lo que cambia en Dynamic

Nada: no se tocó `components/ui/` ni `app/estilos/vidrio/`. La píldora es la `DesplegablePildora` de siempre.
