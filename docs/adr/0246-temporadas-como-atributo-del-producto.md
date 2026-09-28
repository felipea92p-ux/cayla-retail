# ADR-0246 · Temporadas como atributo del producto

- **Fecha:** 2026-09-26 · **Estado:** decidido con Felipe; **construido y fusionado** (#529 y #532) y **en producción
  desde el 2026-09-27**: consulta de solo lectura de ese día, con las 3 tablas, 9 temporadas, 12 fechas y una sola
  versión del alta, lo mismo que pide la parte 6 (ver «Construcción»). Es el paso 3a del bloque 3 de ADR-0208.
- **Pedido:** Frescura del piso (ADR-0208) compara cuánto lleva cada prenda colgada contra lo normal de su categoría en
  su sede. Sin saber de qué temporada es la prenda, mezcla la blusa de verano con la chompa de invierno.
- **Investigación:** `docs/investigacion/2026-09-26-temporadas-de-moda.md` (dos investigaciones con fuentes verificadas).
- **Complementa:** ADR-0208 (Frescura), ADR-0161 (módulos y roles), ADR-0209 (combos), ADR-0212 (carga inicial).

## Problema

- `productos.temporada` existe desde el 2026-09-15, pero es **texto libre** y está **vacío en los 13 productos** de
  producción (consulta del 2026-09-26). «PV 26», «pv2026» y «Verano» contarían como tres temporadas distintas.
- Las etiquetas del catálogo (19 activas, en 23 de 130 variantes) mezclan temporadas con ofertas, festividades y
  «Top ventas». Pueden llevar descuento y limitar en qué sedes se vende.
- Frescura necesita tres cosas que hoy no tiene:
  - con qué se compara cada prenda (verano con verano);
  - cuándo termina la estación de una prenda, para avisar que quedó de la temporada pasada;
  - qué es clásico, para sacarlo del semáforo de novedad.

## Decidí (con Felipe, 2026-09-26, pregunta por pregunta)

1. **Nueve valores, en una lista cerrada:**

   | Valor | Mitad del año | Termina su estación |
   |---|---|---|
   | Primavera-Verano | PV | inicio del otoño (≈ 20 mar) |
   | Primavera | PV | inicio del verano (≈ 21 dic) |
   | Verano | PV | inicio del otoño (≈ 20 mar) |
   | Otoño-Invierno | OI | inicio de la primavera (≈ 22-23 set) |
   | Otoño | OI | inicio del invierno (≈ 21 jun) |
   | Invierno | OI | inicio de la primavera (≈ 22-23 set) |
   | Clásico · todo el año | — | nunca |
   | Clásico · verano | PV | se sugiere guardarlo fuera del verano; no pasa a «temporada pasada» |
   | Clásico · invierno | OI | ídem, fuera del invierno |

   Felipe: una prenda versátil lleva «Primavera-Verano»; un bikini o una pistola de agua, «Verano».

2. **Vive en Productos ▸ Atributos, en una pestaña propia «Temporadas»**, al lado de Tejidos y Patrones. No es una
   etiqueta. La regla que lo decide:
   - **atributos = lo que la prenda ES**, un valor cada uno (tejido, patrón, temporada);
   - **etiquetas = cómo la VENDEMOS**, varias a la vez y pasajeras (oferta, Día de la Madre, Top ventas).

3. **Una sola por prenda**, y lo garantiza la base: es una columna, no una lista de etiquetas. Felipe: «si lo construyo
   para que sea una opción a la vez, se evita el error».

4. **Dónde se pone y quién manda** (de más específico a más general):
   - el **color** puede tener la suya (un color de invierno en un modelo de verano);
   - si no, la del **producto**;
   - si no, la de su **categoría**, como valor por defecto («Ropa de baño» → «Verano»).
   La de la prenda manda sobre la de la categoría.

5. **Opcional al dar de alta.** Lo que quede sin temporada aparece en una lista **«Sin temporada»** para que quien edita el catálogo
   la complete, y Frescura lo muestra aparte. Útil mientras dura la carga inicial (ADR-0212).

6. **Sin año en el nombre.** Nadie elige un año: el sistema sabe de qué año es cada prenda por **la fecha en que llegó a
   la sede**, cruzada con el calendario. En pantalla, lo de la temporada actual se ve sin año («Verano»); lo que sobró
   de una temporada anterior lleva la etiqueta ámbar «Temporada pasada».

7. **Fechas: las oficiales de SENAMHI**, por año, ajustables **solo el año en curso o el siguiente**. Lo pasado queda
   fijo. SENAMHI usa el instante astronómico (equinoccios y solsticios). Ejemplo 2026-27: primavera 22 set 2026 19:05,
   verano 21 dic 2026 15:50, otoño 20 mar 2027 15:25, invierno 21 jun 2027 09:11 (tabla completa en la investigación).

8. **Comparación en Frescura:** una prenda se compara con las de **su categoría, en su sede, en la misma mitad del año**
   (PV u OI). La estación fina (Verano, Primavera…) solo decide **cuándo termina su estación**. Así los pocos datos de
   hoy no se parten en seis grupos.
   **Reemplazada el 2026-09-27 (Felipe):** «envejecida» se mide contra **su categoría en su sede, sin partir por mitad
   del año**; la temporada solo da el aviso aparte «Temporada pasada» y dice qué prendas son clásicas. Partir la vara
   mezclaba dos preguntas (¿se vende más lento que sus hermanas? / ¿ya pasó su estación?) y, con 7 ventas en producción,
   dejaba cada mitad sin datos. La columna `mitad` de `retail.temporadas` queda en la base, pero Frescura no la usa; la
   pestaña Temporadas deja de mostrar «Se compara con». Detalle: ADR-0208, «Actualización 2026-09-27 — diseño 3c».

9. **Un modelo que el Taller repite es el mismo producto**: conserva su código, suma la temporada nueva y **nunca vuelve
   a ser «Nueva»** en una sede donde ya estuvo (lo que ya decía ADR-0208).

10. **Al terminar su estación, Frescura avisa y sugiere** (moverla, trasladarla o retirarla con «fin de temporada»).
    No rebaja nada sola; la rebaja es del líder (bloque 7 de ADR-0208).

## Descarté

- **Guardarla dentro de Etiquetas** (lo que Felipe pensó primero). Revisado contra la base: dos objeciones iniciales no
  valían (solo aplica el descuento más alto y varias etiquetas por prenda es normal), pero dos sí:
  - las etiquetas nacieron para ser varias por prenda; habría que agregar una regla que impida dos temporadas y un
    selector aparte de una sola opción, es decir, una pestaña disfrazada dentro de Etiquetas;
  - una etiqueta tiene **un** rango de fechas y un nombre que no se repite (`etiquetas_clave_unica`); la temporada se
    repite cada año, así que habría que ponerle el año al nombre o cambiarle las fechas, y eso reescribe la historia.
- **El texto libre de hoy:** tres escrituras de lo mismo serían tres temporadas. Está vacío, así que cambiarlo cuesta
  cero hoy.
- **Temporada con año elegido en el alta** («Primavera-Verano 2026-27»): ruido para quien da de alta y riesgo de elegir
  el año equivocado; el año sale solo de la fecha de llegada.
- **Temporada solo en la llegada (el lote):** parte del stock entró por carga inicial, sin recepción, y el ERP no sabe de
  qué lote es cada prenda colgada.
- **Cuatro estaciones sin PV/OI, o solo PV/OI:** Felipe quiso las dos cosas; la mitad del año agrupa y la estación
  fina avisa.
- **Mover las fechas de todos los años a la vez:** las prendas de años pasados cambiarían de temporada.

## Se rompe si

- **La mayoría de las prendas queda «Sin temporada».** Frescura las muestra aparte y no puede avisar su fin de estación;
  la lista existe para que no pase en silencio.
- **Una prenda llega a la sede fuera de su estación.** Regla (corregida al construir, ver «Construcción»): cuenta en la
  aparición de su estación **más cercana en el tiempo**. Una chompa de invierno cargada el 26-set-2026 cae en el invierno
  que terminó 4 días antes y sale «Temporada pasada»; la que el Taller entrega en febrero cae en el invierno que viene.
  Lo que llegue justo a mitad de camino entre dos apariciones puede caer del lado equivocado.
- **Alguien quiere un descuento automático por temporada** («−20 % a todo el verano pasado»). No va en Temporadas: va en
  una campaña de descuento, que ya existe.
- **Una prenda necesita ser de dos temporadas sin ser clásica.** Hoy lo cubren «Primavera-Verano», «Otoño-Invierno» y
  los clásicos.

## Estados que deben ser imposibles (para el paso 3a)

- Dos temporadas en la misma prenda → una columna, no una tabla de muchos a muchos.
- Una temporada con fin antes del inicio, o dos rangos del mismo año para la misma estación → `check` y `unique`.
- Cambiar las fechas de un año que ya pasó → la base lo rechaza.
- Un valor que no está en la lista → llave foránea, no texto.

## Qué falta

- ~~Pegar la migración en producción y, después, publicar la web~~: hecho (ver «Estado»).
- Completar la temporada de las prendas: las 56 de producción (modelo y color, de 17 productos) seguían sin ella, ni
  propia ni de su categoría, el 2026-09-27.
- Fechas desde el verano 2026-27: confirmarlas con SENAMHI cuando las publique (hoy vienen del Observatorio Naval de
  EE. UU.; la diferencia posible es de un minuto). Se corrigen en la pestaña (fuente «SENAMHI»), o con
  `fijar_fechas_temporada('[{"anio": …, "estacion": …, "inicio": …, "fuente": "senamhi"}]')`.
- Agregar al calendario el año 2029 antes de que termine 2028 (la pestaña avisa cuando falta el año siguiente).
- Frescura (paso 3c) lee la temporada con `fn_temporada_efectiva` y el año con `fn_ocurrencia_temporada`.

## Construcción (2026-09-26)

**Migración:** `supabase/migrations/20260928100000_temporadas_como_atributo.sql`, en seis partes que se pegan por
separado. **Prueba:** `pnpm pruebas:temporadas` (23 casos, en el CI). **Reglas de pantalla:** `apps/web/lib/temporada-reglas.ts`.

Lo que cambió respecto de lo escrito arriba, con el porqué:

- **La excepción por color va en su propia tabla**, `producto_color_temporadas` (modelo + color), no en `variantes`. Una
  variante es talla × color: en `variantes`, la M y la L del mismo color podrían quedar en temporadas distintas, y una
  talla nueva nacería sin la excepción.
- **`productos.temporada` no se retira: se reusa con una llave foránea** a la lista (el mismo molde que
  `categorias.familia → familias`). La ficha (`catalogo_actualizar_producto`, con parches vivos) ya recibe y guarda
  `p_temporada`; así no se toca. Antes de poner la llave, la parte 2 deja en null los textos en blanco y aborta si hay
  cualquier otro texto escrito a mano (en producción: 0 de 13, verificado el 2026-09-26).
- **El calendario guarda solo el instante en que empieza cada estación**; el fin es el inicio de la siguiente
  (`fn_calendario_estaciones`). Con desde y hasta guardados podrían quedar huecos o solapes entre dos filas, y ningún
  `check` lo impide.
- **Las fechas se pueden correr hasta 60 días de su fecha astronómica** (el ejemplo de Felipe: el invierno el 25 de mayo),
  nunca cuando la estación ya empezó (disparador `fn_temporada_fechas_candado`) ni fuera de orden (disparador diferido
  `temporada_fechas_orden`, que revisa con todas las fechas ya escritas; los dos valen también para el SQL
  Editor).
- **Sin políticas de RLS.** Las tres tablas tienen RLS encendido y ningún privilegio de afuera: se leen por funciones
  `security definer` de solo lectura (`fn_temporadas`, `fn_calendario_estaciones`, `fn_temporada_efectiva`,
  `fn_ocurrencia_temporada`) y se escriben por RPC. Así la migración de producción no lleva `create policy`
  (ADR-0195).
- **Permisos (Felipe, 2026-09-26):** el calendario lo corren el líder y los Admin (`fn_es_lider()`; un Admin es Líder
  aquí, ADR-0178); la temporada de una prenda o de una categoría la cambia quien puede editar el catálogo
  (`fn_puede_editar_catalogo()`). Todo lo que guarda firma con el responsable (`fn_actor_persona_id(true)`), y cada
  cambio de temporada de una prenda o de un color deja una fila en `historial_producto_cambios`.
- **El alta recrea `crear_producto_con_stock_inicial` con un 14.º parámetro opcional, `p_temporada`**, detrás de una
  guarda md5 del cuerpo vivo (`5eb22cb78bc5574e6a28d3c60879d93f`, igual en local y en producción el 2026-09-26).
- **Fechas sembradas:** 2026 de SENAMHI (el verano, del USNO); 2027 y 2028 del USNO. No se sembró 2025: sus horas no se
  verificaron, y la regla de la aparición más cercana no las necesita para lo que se carga desde hoy.

- **«Agregar año» y correr fechas, todo o nada:** `fijar_fechas_temporada(p_fechas jsonb)` recibe de 1 a 8 fechas y
  las guarda en una transacción; el orden se revisa al final (`set constraints … immediate`), así que correr dos
  estaciones juntas no choca a mitad de camino. Reemplaza a la de una fecha, que dejaba el año a medias si una fallaba.
- **El lote de «Sin temporada» no pisa:** `asignar_temporadas(p_items, p_solo_sin_temporada => true)` salta, con la fila
  ya bloqueada, la prenda que desde que se cargó la lista recibió temporada (propia o de su categoría). La pantalla dice
  cuántas saltó.
- **La web** (revisada por tres revisores y un corrector; probada en el navegador con datos de ejemplo): la pestaña
  «Temporadas» en Productos ▸ Atributos (`components/TemporadasLista.tsx`, ruta `app/api/productos/temporadas`), la
  temporada en la ficha con su sección por color (`ProductoForm`), en el alta (`NuevoProductoForm`), en Categorías (solo
  lectura) y un aviso «N prendas sin temporada · Completar» en Productos para quien edita el catálogo y ve Atributos. El
  historial de la ficha nombra los cambios de temporada (`lib/historial-producto-reglas.ts`).

**Cómo se pega en producción:** la sonda de solo lectura primero (que `productos.temporada` siga vacía, que el md5 del
alta siga igual y que la lista no exista); después las partes 1 a 5, cada una sola; la parte 6 es una consulta de
verificación (9 temporadas, 12 fechas, 3 llaves hacia la lista, 1 sola versión del alta); recién entonces la web.


## Nota 2026-09-27 — la regla pasa a un núcleo (ADR-0208, revisión 3 del paso 3 de Frescura)

`fn_temporada_efectiva` solo mira variantes activas: es la lista de lo que se puede completar. Frescura necesita la
temporada de lo que está colgado, y una talla descontinuada con stock sigue colgada. Para no escribir la regla dos veces,
`20260928120310_frescura_lectura_revision3.sql` (sin pegar; la corrección de `20260928120300`) la mueve a `fn_temporada_efectiva_nucleo(p_producto_id,
p_con_inactivas)` y deja `fn_temporada_efectiva(p)` como envoltorio con `false`: misma firma, mismas filas (la prueba T4d
de `frescura_lectura.mjs` lo compara en todo el catálogo), mismos permisos. La regla (color → producto → categoría)
sigue en UNA función. Si alguien vuelve a pegar `20260928100000`, `fn_temporada_efectiva` recupera su cuerpo original
(las mismas filas) y Frescura no se entera: llama al núcleo.

## Nota 2026-09-27 (b) — la temporada cuenta desde que la prenda llegó a CAYLA, y el pilar de temporada pasada (Felipe; ADR-0208, revisión 5 del paso 3)

Dos decisiones de Felipe que precisan cómo Frescura usa este ADR (el detalle, con DECIDÍ / DESCARTÉ / SE ROMPE SI, en
ADR-0208, «Revisión 5 del paso 3»):

- **«Se rompe si una prenda llega a la sede fuera de su estación»** (arriba) se lee ahora **«llega a CAYLA»**: el año de la
  temporada sale de la última llegada del modelo+color a la empresa (lote o recepción de compra, producción del Taller o
  carga inicial, en cualquier sede), no de la última llegada a la tienda. La recepción de un traslado no reinicia la
  estación: la chompa que llegó del proveedor en julio de 2025 y se trasladó en abril de 2026 es del invierno 2025 en las
  dos tiendas. Vive en `retail.fn_es_llegada_a_cayla` (`20260928120310`, sin pegar) y en el campo `ultima_llegada_cayla`
  de `fn_frescura_sede`; `fn_ocurrencia_temporada` no cambia.
- **Decisión 10 («al terminar su estación, Frescura avisa y sugiere»)**, para lo que se sigue vendiendo: un pilar de
  venta de temporada pasada entra a «Por decidir» con una sola sugerencia, «Sigue vendiendo: decide si la dejas hasta
  agotar o la retiras». No se le sugiere moverla ni trasladarla, y tampoco rebajarla (la rebaja sigue siendo del líder).
  Lo que no se vende sigue con «moverla, trasladarla o retirarla».

## Nota 2026-09-27 (c) — una pregunta abierta sobre la carga inicial (ADR-0208, revisión 6 del paso 3)

«La última llegada a CAYLA» cuenta hoy la carga inicial como una llegada más. Por eso una carga posterior del mismo
modelo+color (la de AQP o LIM al incorporarse, o una talla nueva que una tienda carga por Existencias ▸ Ajustar stock)
mueve el año de la temporada de lo que llegó de verdad por lote, en todas las sedes. La recomendación es que la carga
inicial cuente solo si el modelo+color no tiene lote ni producción, y que entre cargas mande la primera. Está pendiente de
Felipe (ADR-0208, «Revisión 6 del paso 3», pregunta 7; prueba T4i de `frescura_lectura.mjs`). Hasta que decida, rige lo
de la nota (b). *Decidida el 2026-09-27: ver la nota (d).*

## Nota 2026-09-27 (d) — la pregunta de la nota (c), decidida (Felipe; ADR-0208, revisión 7 del paso 3)

Felipe eligió la recomendación. La carga inicial cuenta como llegada a CAYLA solo si el modelo+color no tiene lote ni
producción, y entre varias cargas manda la PRIMERA. Una carga posterior (la de AQP o LIM al incorporarse, o una talla nueva
cargada por Existencias ▸ Ajustar stock) ya no mueve el año de la temporada de lo que llegó por lote. Un modelo+color que
solo vino en cargas conserva la estación de la primera. Vive en `20260928120320_frescura_lectura_revision7.sql`
(`llegada_cayla_de` en `fn_frescura_sede`, sin pegar). `fn_es_llegada_a_cayla` no cambia: sigue diciendo qué movimientos son
llegadas a CAYLA, y la regla nueva solo elige cuál de ellas manda. Con esto, lo de la nota (b) se lee: el año de la
temporada sale de la última llegada del modelo+color a la empresa por lote o producción y, si no tiene ninguna, de su
primera carga inicial. En producción no cambia nada hoy: ningún modelo+color tiene lote y carga a la vez (`select` del
27-sep). Detalle, con DECIDÍ / DESCARTÉ / SE ROMPE SI: ADR-0208, «Revisión 7 del paso 3»; prueba T4i de
`frescura_lectura.mjs`.
