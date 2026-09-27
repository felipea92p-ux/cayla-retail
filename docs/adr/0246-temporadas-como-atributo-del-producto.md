# ADR-0246 · Temporadas como atributo del producto

- **Fecha:** 2026-09-26 · **Estado:** decidido con Felipe, **sin construir** (es el paso 3a del bloque 3 de ADR-0208).
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

5. **Opcional al dar de alta.** Lo que quede sin temporada aparece en una lista **«Sin temporada»** para que el líder
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
- **Una prenda llega a la sede fuera de su estación** (una «Primavera» que llega en enero). Regla: cuenta en la
  aparición más cercana de su estación (la que está en curso o la siguiente), y se revisa si pasa seguido.
- **Alguien quiere un descuento automático por temporada** («−20 % a todo el verano pasado»). No va en Temporadas: va en
  una campaña de descuento, que ya existe.
- **Una prenda necesita ser de dos temporadas sin ser clásica.** Hoy lo cubren «Primavera-Verano», «Otoño-Invierno» y
  los clásicos.

## Estados que deben ser imposibles (para el paso 3a)

- Dos temporadas en la misma prenda → una columna, no una tabla de muchos a muchos.
- Una temporada con fin antes del inicio, o dos rangos del mismo año para la misma estación → `check` y `unique`.
- Cambiar las fechas de un año que ya pasó → la base lo rechaza.
- Un valor que no está en la lista → llave foránea, no texto.

## Qué falta (paso 3a del bloque 3)

- Migración: la lista, el calendario por año con las fechas de SENAMHI 2026-2028, y las columnas en producto, color y
  categoría. `productos.temporada` (texto) se retira después de comprobar en producción que sigue vacía.
- Web: la pestaña «Temporadas» en Atributos, el campo opcional en el alta y en la ficha, y la lista «Sin temporada».
- Fechas desde el verano 2026-27: confirmarlas con SENAMHI cuando las publique (hoy vienen del Observatorio Naval de
  EE. UU.; la diferencia posible es de un minuto).
