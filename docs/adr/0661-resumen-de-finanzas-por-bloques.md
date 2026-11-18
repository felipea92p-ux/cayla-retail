# ADR-0661 — Finanzas ▸ Resumen por bloques: la lectura partida en tres, cada bloque cuando llega lo suyo

**Fecha:** 2026-11-13 · **Estado:** aprobado por Felipe (medir + «Resumen por bloques», en el mismo PR). Construido en la rama
`claude/resumen-por-bloques` (PR #1843). Una migración, **pegada en producción el 2026-11-13** (19:30 de Lima) con el OK de Felipe en la sesión y
verificada por md5 (envoltorio `6f5cc4f3…`, por partes `cb1b94d1…`, dueño `postgres`, `anon` sin permiso): `20261113235000_resumen_finanzas_por_partes.sql`
(ver «Cómo se pega»).
**Sigue a:** ADR-0195 F10 (el Resumen), ADR-0493 (El telar, la mesa común), ADR-0583 (lecturas a la vez), ADR-0622 (rendimiento medido con un año de
datos y candado md5), ADR-0633 (la foto del diario), ADR-0654 (el cronómetro del clic), ADR-0149 (loader único), ADR-0185 (nada salta), ADR-0424
(errores sin datos personales).

## El problema

Finanzas ▸ Resumen tarda 6,4–6,7 s en producción (el cronómetro del clic, 2026-11-13) y la persona no ve nada hasta que llega todo. Lo más largo es
`fn_resumen_finanzas`: **4,3 s de media** (`pg_stat_statements`, 230.000 bloques por llamada), porque arma sus 13 partes **una detrás de otra** en una
sola llamada. Su propio `ms` en los logs (`finanzas_resumen_ms`, mediana de 10 cargas mirando CAYLA entera, 12 y 13 de noviembre) dice cuáles pesan:

| Parte | Mediana en producción | Qué arma |
|---|---:|---|
| `resultados_mes` | 2.052 ms | `fn_estado_resultados` del 1 a hoy, en vivo (el mes en curso no tiene foto) |
| `presupuesto` | 944 ms | `fn_presupuesto_vs_real`, que **vuelve a armar ese mismo estado de resultados** |
| `resultados_anterior` | 404 ms | `fn_estado_resultados` de octubre (con su foto) |
| las otras diez | ≈ 630 ms | saldos, deudas, la caja que viene (335), campañas, IGV, egresos, fijos, gastos raros, el cierre, lo sin cuenta |

Las tres primeras son ~78 % del total, y lo que la pantalla muestra primero («Libre para usar», lo que viene en la caja) sale de las otras diez.
Además, la base de producción tiene **2 núcleos** y una carga de Resumen le pide ~15–18 s de trabajo en total: el Resumen, el balance de cada sede
(`fn_balance_por_tienda`, 2,4 s, que arma OTRA VEZ el estado de resultados del mes), `fn_flujo_caja_real` seis veces (un día cada una, ~0,7 s),
`fn_rendimiento_serie` por tienda (~0,95 s), `fn_costo_estimado_resumen` por sede (~0,33 s), la confianza y la provisión de sueldos (~0,7 s cada una).
La base está llena durante toda la carga: aunque una lectura sea liviana, si sale junto con todas, tarda lo que tarde la más lenta en soltar la máquina.

## Decisión

1. **La lectura se parte sin copiar la regla.** Nace `retail.fn_resumen_finanzas_partes(p_ubicacion_id, p_solo_empresa, p_partes text[])`: el MISMO
   cuerpo de `fn_resumen_finanzas` (generado desde su definición viva, md5 `061a3cec…`; quitando los «si se pidió» queda letra por letra igual), con
   cada parte dentro de `if v_todo or '<parte>' = any (p_partes)`. Lo de arriba (permiso, qué se mira, parámetros, sedes) corre siempre. Una parte que
   no existe, o un nulo en la lista, es error `22023`, nunca una respuesta a medias. `fn_resumen_finanzas` pasa a ser `fn_resumen_finanzas_partes(…, null)`:
   la regla vive en UN lugar, y la entera sigue respondiendo lo mismo (la usan la prueba de siempre y el respaldo de la web).
2. **Tres grupos** (`GRUPOS_DEL_RESUMEN`, `lib/resumen-finanzas-partes.ts`): `rapido` (las diez livianas), `mes` (`resultados_mes`) y `avisos`
   (`resultados_anterior` + `presupuesto`). `juntarResumen` arma con las tres respuestas el MISMO `ResumenFinanzas` de la lectura entera: cada parte sale
   del grupo que la pidió. Si cae solo el mes o los avisos (cada lectura tiene su tope de 8 s), sus partes dicen «no se pudo leer», nunca un cero.
3. **La puerta.** Al principio corren SOLO la rápida, el mes (el bloque que sigue) y lo de unos pocos ms (la planilla para «Libre para usar», lo que
   falta del mes, la caja de una sede si se mira una); todo lo demás arranca cuando la rápida termina. Con 2 núcleos, la rápida tiene la máquina para
   ella; el total casi no cambia porque la base ya estaba llena. El turnero de 3 (`CUPOS_PESADOS`, 2026-11-09) sigue igual.
4. **Cada bloque espera solo lo suyo.** La página espera la rápida (la cabecera dice qué se mira) y le pasa lo demás al panel como **promesas**
   (`LecturasDelResumen`). Cada bloque de `components/finanzas/ResumenFinanzas.tsx` hace `use()` de lo que necesita dentro de su `<Suspense>`; las cuentas
   que antes se hacían una vez en línea viven en `lib/resumen-bloques.ts` (`armarCaja`, `armarMes`) y cada bloque las arma con lo que le llegó: son las
   mismas funciones con los mismos argumentos. Lo que la persona elige (las hojas, «Qué se ve» de la inversión, la forma de pagar) vive arriba, fuera de
   toda espera. Para saber si una hoja tiene con qué abrirse, `hayHoja` mira solo su dato (`HojasResumen.tsx`).
5. **El lugar de cada bloque se guarda.** `EsperaBloque` (`components/finanzas/bolsillos/EsperaBloque.tsx`): la misma tarjeta de vidrio, su título
   (`TituloSeccion`, como `MovimientosEsperando`) y bandas que respiran, con el alto de lo que suele traer. Lo de la primera pantalla guarda su alto justo
   (medido a 1440 px); lo de abajo se estima por lo que trae (una fila por tienda o por unidad, que la lectura rápida ya dice). Sin tiendas que mostrar,
   los movimientos toman la fila entera por CSS (`:has`), sin que la página lo decida antes. No se enciende el loader global (ADR-0149): la pantalla ya
   se puede leer y usar.
6. **Se mide en producción.** Además de `finanzas_resumen_ms` (las 13 partes, ahora de tres lecturas), cada bloque deja
   `{"evento":"finanzas_resumen_bloque","bloque":…,"ms":…,"todas":…}` cuando llega lo último que necesita (`anotarBloques`), con los ms desde que empezó
   la página. Solo cifras y el nombre del bloque (ADR-0424). Se busca con `vercel logs --query finanzas_resumen_bloque`.
7. **El orden de publicación no importa.** Sin `fn_resumen_finanzas_partes` (PGRST202), la web pide la entera UNA vez y la reparte entre los tres
   grupos: se ve como hoy, sin la mejora de la rápida.

## Lo que se probó

- **Ni una cifra cambia.** En la base: md5 de la respuesta (sin `ms`) de `fn_resumen_finanzas` antes y después de la migración, idéntico en 16 casos
  (el líder mirando CAYLA, la empresa y cada sede; una integrante con el módulo) sobre dos bases (la local y la copia de un año).
  `pnpm pruebas:resumen-por-partes` (26 casos, en el CI): las tres lecturas juntas son la entera al byte en cada caso, con su control (con un grupo de
  menos NO coincide); cada parte pedida sola es la misma; una parte que no existe es error; permisos iguales. `pnpm pruebas:resumen-finanzas` (68/68)
  sigue en verde con el envoltorio. En la web: `lib/resumen-finanzas-partes.test.ts` (los grupos son una partición, son los de la migración y de su
  prueba, y `juntarResumen` da el `leerResumen` de la entera en los cinco casos del fixture, con el corte de Finanzas y con una parte caída).
  **Y la página dibuja las mismas cifras:** el HTML del servidor con el código de `main` y con el de esta rama, sobre la misma copia, tiene las mismas
  198 cifras mirando CAYLA, 86 una tienda, 84 la empresa, 177 un mes pasado y 167 un tramo (la única diferencia es la hora de la cabecera).
- **Llega antes y no salta** (copia de un año, servidor de desarrollo, Chromium sin pantalla, 1440 px): antes, nada hasta **6,8 s** y todo de golpe;
  ahora la cabecera y «Libre para usar» a **~2,1–2,3 s**, «Próximos» ~2,4 s, Movimientos ~4,1 s, la frase, las preguntas y las tiendas ~4,6 s, el mes y
  «Hoy te toca» ~5,1–5,5 s. **CLS 0,003** a 1440 px (en claro, oscuro, quieto y vivo) y **0** a 375 px, sin desborde. En esa copia la parte rápida pesa
  más que en producción (un año de ventas: la caja que viene 650 ms, IGV 270, campañas 215); en producción son ~630 ms en total.
- `/milimetro auditar /finanzas/resumen` (1440 claro/oscuro/quieto/vivo y 375): 0 hallazgos en las piezas nuevas; los títulos en espera pasan contraste
  en los dos temas. Lo que marcaron los medidores es de piezas que ya estaban (ver `docs/milimetro/auditorias/2026-11-13-finanzas-resumen-por-bloques.md`).

## Cómo se pega

Una sola parte, sin políticas, sin `alter table`, sin `drop`, sin `select … into` fuera de un cuerpo `$$`: dos `create or replace function` y sus
permisos, con `set lock_timeout = '3s'`. Frena sin cambiar nada si `fn_resumen_finanzas` no es la de main (md5 `061a3cec3d280b98c5bd7cccf25f3685`,
verificado en producción el 2026-11-13) ni ya el envoltorio, o si alguien cambió la función por partes. Se puede pegar dos veces. Termina con
`20261113235000 · QUEDÓ BIEN`.

1. **Antes de fusionar** (la web vieja sigue igual con el envoltorio, que responde lo mismo): pegar el archivo entero (SHA-256 en la descripción del PR).
2. Verificar: `select md5(prosrc) from pg_proc where oid = 'retail.fn_resumen_finanzas(uuid,boolean)'::regprocedure` → `6f5cc4f3f5e93f5a598cb1730dbc4030`,
   y la de `retail.fn_resumen_finanzas_partes(uuid,boolean,text[])` → `cb1b94d1868ad74b9b3c975f4ab6870c`.
3. Fusionar. A las 24 h, leer `finanzas_resumen_bloque` (cuándo llega `cabecera`/`libre`, meta < 1,5 s) y `tiempo_de_pantalla` de `/finanzas/resumen`.

## Lo que no se hizo (a propósito) y lo que sigue

Felipe pidió medir y proponer, no bajar todavía. Las tres propuestas, en el backlog de la rama con su ranking:

1. **El estado de resultados del mes a hoy se arma tres veces por carga** (`resultados_mes`, dentro de `presupuesto` y dentro de `fn_balance_por_tienda`):
   armarlo una vez y pasárselo a las otras dos. Ahorra ~0,9 s (presupuesto) y ~2 s (balance) de base por carga. ⚠ Dinero: espera a Felipe.
2. **La foto de los días ya terminados del mes en curso** (extender ADR-0633, propuesta ya escrita en el informe `cambiar-de-modulo`): lo que queda en
   vivo es solo hoy. ⚠ Cambia ADR-0633 punto 1 y es dinero: espera a Felipe. Cerrar septiembre y octubre (Felipe con su contador) ya ayuda a los meses pasados.
3. **Fuera del Resumen, lo que la página pide de a uno:** `fn_flujo_caja_real` seis veces (Movimientos), `fn_rendimiento_serie` una vez por tienda y
   `fn_costo_estimado_resumen` una vez por sede: pedirlas de una vez.

## Riesgos

- **Tres lecturas, tres fotos de la base.** Cada grupo ve la base en su momento; una venta que entra entre dos lecturas puede estar en una y no en otra.
  Ya pasaba entre el Resumen y las otras lecturas de la página (estado de resultados, balance, caja): no es un estado nuevo.
- **Los altos guardados son estimaciones.** Un bloque más alto que su lugar crece hacia abajo; en la primera pantalla los altos son los medidos, lo de abajo
  se estima. Si cambia una tarjeta, revisar `ALTO` en `ResumenFinanzas.tsx`.
- **Con el panel del navegador oculto, React no revela los bloques** (espera un cuadro de pintura): la verificación visual de esta rama se hizo con
  Chromium sin pantalla. En un navegador normal no pasa.
- **La guía interactiva** (`finanzas.resumen`) no cambió de anclas ni de controles (su huella sigue igual), pero si alguien la abre antes de que lleguen
  todos los bloques, un paso cuya pieza todavía no llegó la espera ~0,9 s como cualquier pieza que aparece.

## Actualización 2026-11-14 — bajar el trabajo total (rama `claude/resumen-trabajo-una-vez`)

**Pidió:** Felipe aprobó el plan «Medir y bajar trabajo» (relayado por la sesión de rendimiento): hacer las dos propuestas que no cambian reglas.
**Medido en producción** desde las 00:07 UTC del 2026-11-14, con todo publicado: `fn_resumen_finanzas` 3,8 s por carga, `fn_balance_por_tienda` 1,8 s y
`fn_flujo_caja_real` 6 llamadas × 0,63 s: ~9–10 s de CPU por carga en una base de 2 núcleos compartidos, que es lo que da los ~6,8 s de pared.

**(b) El estado de resultados del mes, UNA vez por carga** (`20261114005000_estado_de_resultados_una_vez.sql`). Se armaba tres veces: `resultados_mes`,
dentro de `fn_presupuesto_vs_real` y dentro de `fn_balance_por_tienda`. Ahora las dos últimas envuelven a `fn_presupuesto_vs_real_de` y
`fn_balance_por_tienda_de`: su mismo cuerpo vivo (generado del texto de producción, con candado md5), con un solo cambio: aceptan un estado de resultados
ya armado (`retail.fila_estado_resultados[]`, un tipo con las columnas de `fn_estado_resultados`) y lo usan **solo si calza** (las mismas fechas y la
misma sede que iban a armar); si no viene o no calza, lo arman como siempre. Las `…_de` no las puede llamar nadie de afuera: nadie les pasa un estado de
resultados inventado. `fn_resumen_finanzas_partes` arma el del mes una vez, se lo pasa al presupuesto y, con la parte nueva `balance` (opt-in: no entra
en la lectura entera), al balance de cada sede a hoy. La web pone el presupuesto en el grupo del mes y, mirando CAYLA entera del 1 a hoy, toma el balance
de esa lectura (`getBalancePorTiendaDeFilas`); si no, lo pide aparte como antes. Sin la migración, una base vieja responde 22023 a `balance` y la web
pide el grupo sin ella.

**(a) «Movimientos» en una sola lectura** (`20261114010000_movimientos_en_una_lectura.sql`). Cada día leía los saldos de todas las cuentas tres veces
(`fn_cuentas_dinero_saldos`: el disponible de la víspera, el del día y lo que vuelve a los fondos): 18 lecturas para 7 fechas. Ahora
`fn_flujo_caja_real` envuelve a `fn_flujo_caja_real_de` (su mismo cuerpo, que acepta esos tres saldos ya leídos) y `fn_flujo_caja_real_dias(p_dias)`
los lee una vez por fecha. **Las líneas no se juntan:** `fn_flujo_lineas` arma las suyas con `fn_dinero_libro(hasta)` y `fn_fondo_por_completar(hasta)`,
que dependen del corte; pedir un tramo no garantiza lo mismo que día por día, así que siguen día por día (61 ms cada una en producción). La regla del
disponible y de lo que vuelve a los fondos queda escrita en dos lugares (`fn_flujo_disponible`/`fn_flujo_por_volver` y la lectura de días):
`pnpm pruebas:flujo-real-dias` falla si dejan de coincidir.

**Ni una cifra cambia.** md5 de la salida antes y después: `fn_presupuesto_vs_real` (cuatro meses, cada sede, con fecha fija), `fn_balance_por_tienda`
(cuatro cortes), `fn_resumen_finanzas` (cada sede, la empresa, una integrante) y `fn_flujo_caja_real` (41 días y 4 tramos): 170 casos en dos bases.
En la página, las mismas 198 / 86 / 84 / 177 / 167 cifras que con el código de #1843 sobre la misma copia. Y en la misma lectura, el presupuesto y el
mes son los de la entera y el balance es `fn_balance_por_tienda(hoy)` (`pruebas:resumen-por-partes`, ahora 40 y 64 casos).

**Medido en la copia de un año** (`scripts/rendimiento/medir-resumen-finanzas.mjs`, SOLO=pagina; mediana de 3, ms / bloques):

| Lectura | Antes | Después |
|---|---:|---:|
| Movimientos, 6 días | 2.630 / 309.678 | 1.476 / 172.366 |
| El mes, el presupuesto y el balance | 1.068 / 350.991 | 607 / 148.600 |
| ↳ el presupuesto (aislado, con el estado de resultados ya armado) | 489 | 130 |
| ↳ el balance (aislado) | 472 | ~235 |

En la página (copia, servidor de desarrollo): «Hoy te toca» de ~5,1 a ~3,1 s, el mes de ~5,2 a ~3,7 s, todo de ~5,4 a ~4,4 s; lo primero igual (~2,2 s);
CLS 0,002 a 1440 px y 0 a 375.

**Las pruebas que vuelven a pegar migraciones viejas** ancladas en `fn_flujo_caja_real` (`finanzas_arranque`, `fondo_sale_al_gastarse`,
`mercaderia_pagada_balance`) lo hacen entre `DESHACER_20261114010000` y `REHACER_20261114010000` (`scripts/pruebas/_deshacer_20261114010000.mjs`,
como `_deshacer_0622.mjs`). `finanzas_alcance_coherente` mira la regla de alcance en la función o en su `…_de`.

**Cómo se pega:** las dos son de una sola parte, sin políticas, sin `alter table` y sin `drop`, con candado md5 y se pueden pegar dos veces; el orden entre
ellas no importa, y la web funciona antes y después. Pegarlas antes de fusionar. Las huellas esperadas están en la descripción del PR.

**Sigue (no hecho):** la tercera propuesta, la foto del diario por día del mes en curso (cambia el punto 1 de ADR-0633): queda en el backlog de la rama
con la cifra de producción que salga después de pegar (a) y (b), para que Felipe decida si hace falta. Y lo que la página todavía pide de a uno:
`fn_rendimiento_serie` por tienda y `fn_costo_estimado_resumen` por sede.
