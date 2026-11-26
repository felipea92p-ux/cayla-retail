# ADR-0705 — El probador dimensiona la prenda de arriba por su pecho, con las axilas que dice una IA

**Fecha:** 2026-11-26 · **Estado:** aceptado por Felipe («Sí, constrúyelo», 2026-11-26). Construido en la rama `claude/probador-medida-por-axila`.
La migración `20261126153000_recortes_medida_ia.sql` **no está en producción**: espera el OK de Felipe para pegarla (dos partes, en orden).
**Afecta:** `apps/tienda/lib/union-prendas.ts` (`anchosPorFila`, `anchoDelPecho`, `cajaPorElPecho`, `VERSION_DE_LA_MEDIDA` 3), `apps/tienda/lib/probador.ts`
(el `ia` de cada recorte), `apps/tienda/components/probador/useUnionDeLaFigura.ts`, `apps/web/lib/medida-ia-reglas.ts`,
`apps/web/app/api/fotos/medir-recortes/route.ts`, `apps/web/vercel.json`, `apps/web/lib/rutas-cron.ts`.
**Relacionado:** ADR-0434 (el probador), ADR-0449 (la unión y el ajuste por el torso, act. c), ADR-0442 (el recorte sale del PNG de la IA), ADR-0659
(la llave de OpenAI en el servidor).

## Contexto

Felipe (2026-11-25), con una captura de la tienda: la «Camisa Dalia» amarilla (CMS-0092) se veía enorme junto al jean, y pidió «una manera definitiva». Medido con
el código del probador: la prenda de arriba se agranda o se achica según el ancho de su **borde de abajo** (`factorDelTorso`, ADR-0449 act. c). Esa blusa tiene un
nudo que junta el bajo: mide 25 cm abajo contra los 40 de una blusa normal, y el probador la agrandaba **35 %**, el tope. Pasa con toda blusa anudada, fruncida o
cruzada abajo. Las ~20 reglas de `union-prendas.ts` adivinan la forma por los píxeles, y cada estilo de foto nuevo rompe alguna.

Se descartaron, con Felipe: marcar los puntos a mano en el ERP (maqueta en `docs/maquetas/probador-puntos-2026-11/`: «no queremos agregar más pasos»); armar la
figura desde cero con lo que dice la IA (probado: se veía peor que el probador de hoy, que tiene meses de ajuste); vestir a una modelo con IA (FASHN, 5–15 s por
cambio: no sirve para deslizar). La prueba con 26 recortes reales (2026-11-26): la IA (`gpt-5-mini`) acertó el tipo de las 26, incluido un halter, tres
strapless, un body y una falda cargada como «Polos» (POL-0065); la axila salió bien en ~22 de 26 a ojo. Costo medido: **US$0,0008 por foto** (~6 s).

## Decidí

1. **La prenda de arriba CON MANGAS (blusa, camisa, polo, top de manga) se dimensiona por su PECHO, no por su bajo.** Las sin mangas (tirantes, halter,
   strapless, corset, body) siguen con la regla de siempre: ya se veían bien y medidas por el pecho salían más anchas que la cadera (Felipe, 2026-11-26, con el
   Top Vanessa sobre un jean: «se ve peor con ese arreglo»). El pecho es el ancho del torso un poco bajo las axilas
   (`anchoDelPecho`: la mediana de tres filas, 4 % bajo la axila); se lleva a 44 cm planos (`PECHO_ESTANDAR`) × su holgura (ajustada 1, normal 1,1, holgada 1,25; calibrado con las blusas de mangas que ya se veían bien:
   Akira 44,5 y TOP-0021 46,5 ajustadas, Polo Básico 53,6 normal, Blusa Brillo 63,2 holgada; la Camisa Dalia se veía de 63,7),
   con topes 0,7–1,45. Crece o se encoge desde el centro de los hombros, sin subir, como antes. El nudo, el volado o el corte del bajo ya no cuentan.
   **Y la prenda de abajo deja de seguir al bajo de esa blusa:** con la blusa medida por su pecho, la pretina es la cintura estándar (36 cm,
   `cajaDeAbajoUnida` con `porElPecho`) y la blusa cuelga encima, como en una persona. Sin esto no alcanzaba (Felipe, 2026-11-26: «lo sigo viendo igual»): la
   blusa se achicaba, pero el bajo angosto del nudo arrastraba la pretina del jean al mínimo (30,6 cm) y el jean se achicaba con ella; la proporción pasaba de
   1,70 a 1,53 nada más. Con la cintura del cuerpo pasa a 1,31 (un cuerpo real anda en 1,2–1,3).
   **Una falda, igual: su tamaño real «como en una persona»** (Felipe, 2026-11-26), pero **nunca más ancha que el 90 % del pecho de la blusa**
   (`FALDA_SOBRE_EL_PECHO`; Felipe eligió 90 % mirando 90 y 80: a la par se veía como una caja), y **arranca bajo el punto más bajo de la blusa** (con el
   solape de 3 px), sin quedar tapada: se ve su pretina o su cinturón, también bajo el nudo de la Camisa Dalia. Probado antes y descartado: que la falda siguiera al bajo de la blusa salía angosta y, como su
   largo sale de su ancho, también corta; y tapada bajo la blusa quedaba como un bloque y el conjunto parecía una túnica.
2. **Las axilas las dice una IA, una vez por recorte, sola.** `GET /api/fotos/medir-recortes` (cron cada 10 min, `CRON_SECRET`, llave de servicio) toma hasta 12
   recortes sin medida (`retail.recortes_sin_medida_ia`), le manda a OpenAI la URL pública del recorte en baja resolución y guarda lo que responde
   (`retail.anotar_medida_ia`): tipo, zona, holgura, si va metida y la altura de las axilas (fracción del alto). Nadie del equipo hace nada.
3. **El ancho exacto lo miden los píxeles**, en la misma medida de siempre (`/api/medida/[archivo]` de la tienda): ahora guarda también el ancho fila por fila
   (`anchos`, 50 filas: el tramo que pasa por el medio, sin las mangas sueltas).
   `VERSION_DE_LA_MEDIDA` sube a 3: las medidas guardadas se rehacen solas.
4. **La medida es del recorte, no de la foto.** `medida_ia` guarda el archivo del recorte que miró; si el recorte se rehace, deja de valer sola (sin tocar
   `registrar_recorte`). `tienda_probador` solo la entrega si coincide y no es un fallo.
5. **Sin la medida, todo sigue como hoy** (principio 9): sin `OPENAI_API_KEY`, si la IA no responde, si respondió algo raro (se anota como fallo y no se reintenta) o
   si el recorte es nuevo, la prenda se dibuja por su bajo, como hasta ahora.
6. **`tienda_probador` se reescribe desde su definición de producción** (pg_get_functiondef, md5 `3870a021…`), no desde la del repo (20261017025000, más vieja): una
   línea más en `recortes_prenda`.

## Medido (simulación con las funciones reales de la tienda; láminas en `docs/maquetas/probador-puntos-2026-11/prueba-ia/`)

Pecho de la blusa ÷ cintura de lo de abajo (cm planos): Camisa Dalia + jean, **hoy 63 ÷ 37 = 1,70 → 47 ÷ 36 = 1,31**; Blusa Brillo + pantalón, 1,62 → 1,44;
Blusa Akira + pantalón, 1,11 → 1,26 (su pantalón medía 41,5 de cintura y ahora 36).

| Outfit | Factor de hoy (por el bajo) | Factor nuevo (por el pecho) |
|---|---|---|
| Camisa Dalia (CMS-0092, nudo) con jean, pantalón y falda | 1,34 (agrandada) | 1,00 (como está) |
| Blusa Brillo con pantalón y con falda | 1,12 | 1,00 |
| Polo Básico (POL-0049) con jean | 1,04 | 0,94 |
| Blusa Akira (CMS-0117) con pantalón | 0,86 | 0,85 |
| Top encaje manga larga (TOP-0021) con falda | 1,35 | 1,27 |
| Camisola y Top Vanessa (tirantes) con jean | 1,19 y 1,29 | iguales que hoy (sin mangas: regla de siempre) |

La simulación de «hoy» se comparó con capturas de la tienda real: coincide. La axila de CMS-0092 se marcó a mano (0,26) porque la clave de la prueba ya se había
borrado; las demás son las de la IA.

## Descarté

- **Que la figura crezca hasta llenar el arco.** Lo mostré en la prueba; lo saqué de este cambio: al deslizar de un pantalón a una mini, toda la figura saltaría de
  tamaño. Con la blusa ya en su medida, un outfit con falda corta queda más chico y con aire abajo (es su tamaño real). Si molesta, es otra decisión.
- **Guardar el ancho del pecho en la base** (medido en el servidor del ERP): el ERP no tiene una librería de imágenes en el servidor, y la tienda ya mide cada recorte.
- **Medir las prendas de abajo y los bolsos por la IA:** se guarda lo que dice (tipo, zona), pero solo lo usa la prenda de arriba. La pretina ya se mide bien.

## Riesgos

- **La axila de la IA no es exacta** (a ojo, 4 de 26 corridas un poco bajas, en corsets y un strapless). Se mide 4 % bajo la axila y con la mediana de tres filas,
  y los topes acotan un error grande. Si una prenda sale mal, hoy no hay forma de corregirla a mano: se le borra la medida en la base y vuelve a la regla del bajo.
- **Una prenda sin mangas con nudo o fruncido abajo** sigue con la regla del bajo y podría agrandarse como la Camisa Dalia. No había ninguna en la prueba.
- **Una primera versión agrandaba los tops de tirantes** (1,42–1,45, más anchos que la cadera del jean): por eso solo las de mangas van por el pecho.
- **Costo:** ~US$0,30 para todo el catálogo actual y menos de un centavo por foto nueva, en la cuenta de OpenAI de producción.
- **No probado en la tienda real ni en el navegador:** solo pruebas, Postgres local con `begin … rollback` y la simulación con las funciones reales.

## Se rompe si

- Otra rama reescribe `tienda_probador` desde la versión del repo de 20261017025000: pierde el `ia` (y las mejoras de rendimiento de producción).
- Alguien quita `anchos` de `medirRecorte` sin subir `VERSION_DE_LA_MEDIDA`: las medidas guardadas un año en el navegador no traerían el pecho.
- La pretina vuelve a seguir al bajo de una blusa medida por su pecho: el nudo arrastra al pantalón y la proporción no cambia (lo vigila `union-prendas.test.ts`).
- `cajaPorElPecho` vuelve a devolver `null` cuando la prenda ya está en su medida: manda la regla del bajo y el nudo la agranda otra vez (lo vigila
  `union-prendas.test.ts`).
