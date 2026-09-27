# ADR-0246 · Temporadas como atributo del producto

- **Fecha:** 2026-09-26 · **Estado:** decidido con Felipe y construido (PR #529). La migración `20260928100000` está
  **pegada en producción por Felipe el 2026-09-27** y verificada (9 temporadas, 12 fechas, 3 llaves, 1 sola alta; huella md5 de las 13 funciones idéntica a la de local; orden diferido y RLS puestos). Es el paso 3a del bloque 3 de ADR-0208.
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

- ~~Pegar la migración en producción~~ (hecho el 2026-09-27) y publicar la web (fusionar el PR #529).
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

