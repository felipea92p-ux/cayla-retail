# ADR-0326 — Los filtros de Existencias, con la estructura de Productos y un solo vocabulario

**Fecha:** 2026-10-03 · **Estado:** construido y verificado en local, solo web y sin migración; PR por fusionar ·
**Decide:** Felipe (la lista de 8 actividades, «Hoy» con cuatro opciones, Marca en «Gestión» y «la misma estructura, no
implementarlo dentro de productos»); Claude (lo técnico) · **Rama:** `claude/product-attributes-sync-8c14c5`

## 1. El problema, primero

Felipe mostró Existencias filtrada por «Polo» y dijo que marca, color, categoría, acción, talla y estado «no se sincronizan».
Leyendo el código salieron tres causas, no seis bugs sueltos:

1. **Cada combo ofrecía todo el stock de la sede**, no lo que dejaban los demás: elegir Krisstell y después un color que
   Krisstell no tiene dejaba la lista en blanco sin aviso. Productos ya lo había resuelto (ADR-0308): Existencias era la
   barra que quedó atrás, y el ERP tenía dos barras de filtros que se comportaban distinto.
2. **La misma situación se decía de cinco maneras**: el filtro «Acción» («Reponer a piso» / «Mantener»), «Por colgar»
   escondido en «Estado», la tarjeta («N tallas sin stock en piso»), el cajón («Faltan tallas en piso», «Piso al día») y la
   tabla. Filtrar «Por colgar» mostraba tarjetas que decían otra cosa, y «Mantener» + «Por colgar» siempre daba vacío.
   Además «Reponer a piso» juntaba tallas que se pueden bajar hoy con tallas cuyo almacén está vacío (Polo Lucky Azul claro:
   piso 1, almacén 0, «por reponer»).
3. **Cada pieza miraba un pedazo distinto sin decirlo**: el buscador pisaba en silencio la píldora de Talla o Color (con
   «azul» escrito y Color en «Beige», el combo decía Beige y la lista traía azules), y con «Talla: M» la tarjeta decía
   «Piso 0» como si fuera el total del modelo.

Y dos defectos chicos: el combo Talla ordenaba como texto («10, 2, 4, Estándar, L, M, S, XL, XS») y los filtros vivían en la
memoria de la pestaña (al volver de «Bajar al piso» había que rehacerlos; no había enlace que mandar a otra sede).

## 2. Lo que decidió Felipe (2026-10-03)

| Pregunta | Decisión |
|---|---|
| Alcance | Las 8 actividades, una por una; **«la misma estructura, no implementarlo dentro de productos»**: componente propio, Productos intacto |
| «Hoy» | Cuatro opciones, una por talla: **Por colgar · Por reponer · Sin stock atrás · Mantener**, con las mismas palabras en la tarjeta |
| Marca | En la fila «Gestión», como en Productos |

## 3. Decisiones técnicas

```
DECIDÍ:    la URL es la única fuente de verdad de los filtros de Existencias, pero cambiar uno NO navega: se reescribe con
           history.pushState (un clic suma una entrada, «Atrás» lo deshace) y el buscador con replaceState a los 300 ms.
           Next 16 sincroniza useSearchParams con la historia nativa. Lógica pura en lib/existencias-filtros.ts, gancho en
           components/useFiltrosExistencias.ts. Un valor de la URL que la sede no ofrece no filtra (valorOfrecido).
DESCARTÉ:  (a) navegar con router.push como Productos: cada clic volvería a pedir la página entera (stock, red, tránsito,
           apartados, ritmo) y encendería el loader, cuando Existencias ya tiene todo en el navegador; (b) dejar los useState
           de antes: al volver de otra pantalla o recargar se perdía todo.
SE ROMPE SI: una navegación de Next (router.refresh tras un guardado) llegara con una URL vieja: no pasa, porque refresh
           conserva la URL vigente. «Atrás» a una entrada de ANTES de una recarga sí vuelve a pedir la página (~3 s, medido):
           es la historia del navegador, no un error.
```

```
DECIDÍ:    los números de cada opción se cuentan en el navegador (conteosDeFiltros), disyuntivos —cada filtro con todos los
           demás puestos menos el suyo— y por producto (modelo), la unidad del «N productos» de arriba. Se esconden las
           opciones en 0 salvo la elegida (opcionesConConteo, la misma de Productos).
DESCARTÉ:  una función de la base como fn_productos_facetas: Existencias ya trae todas sus filas; medido con 2.400 tallas
           (el volumen de TRU), los conteos tardan 0,8–5 ms por cambio. Una consulta más sería espera sin ganancia.
SE ROMPE SI: una sede llega a decenas de miles de tallas activas en una sola pantalla: ahí contar al teclear se notaría y
           tocaría pasar los conteos a la base, como Productos.
```

```
DECIDÍ:    «Hoy» es UN caso por talla (lib/existencias-hoy.ts, hoyDeTalla): Por colgar (piso libre 0 y algo atrás) → si el
           motor pide reponer, Por reponer (hay algo libre atrás) o Sin stock atrás (almacén vacío) → si no, Mantener. La
           tarjeta, la lista «Por prenda», el cajón y la columna de la tabla usan las mismas palabras y el mismo tono
           (TONO_HOY). «Condición» (Dañadas · Apartadas) reemplaza a «Estado» y no excluye a «Hoy». El motor de Acción hoy
           (calcularAccionHoy, regla del 2026-09-25) no cambia: «Hoy» solo separa su «Reponer a piso» según haya algo atrás.
DESCARTÉ:  mantener «Acción» y «Estado» con conteos (seguían el choque de palabras y las combinaciones que siempre dan
           vacío); tres opciones con «Por reponer» incluyendo el almacén vacío (la asesora filtra para trabajar y parte de la
           lista no se puede hacer).
SE ROMPE SI: alguien cambia la regla de piso para que «Por colgar» deje de ser parte de «Reponer a piso»: el orden de las
           preguntas en hoyDeTalla sigue dando un solo caso, pero la tarjeta «Reponer a piso hoy» (que todavía cuenta por el
           motor, ver §5) y el filtro dirían cifras distintas.
```

```
DECIDÍ:    el texto del buscador y las píldoras se aplican a la vez, como en Productos; si no queda nada, el estado vacío
           ofrece quitar UNA cosa y su número cuenta productos (antes contaba tallas y decía «6 prendas» para traer 2).
DESCARTÉ:  que el texto mande sobre la píldora de Talla o Color (lo de antes): era una regla invisible que hacía que la píldora
           y la lista dijeran cosas distintas.
SE ROMPE SI: alguien escribe una talla y tiene otra puesta en la píldora: queda vacío a propósito, y el estado vacío lo dice.
```

```
DECIDÍ:    componente propio (components/FiltrosExistencias.tsx) armado con las piezas de ui/FiltrosPildora, y las reglas de
           color por familia de lib/productos-filtros.ts (opcionesDeColor, alternarColor, estadoDeColor) importadas sin
           tocarlas; el panel abierto/cerrado con su propia cookie (cayla_filtros_panel_existencias).
DESCARTÉ:  reusar FiltrosProductos (Felipe: «no implementarlo dentro de productos»; además filtra en la base y navega) y copiar
           las reglas de color (dos árboles de casillas que se separarían con el tiempo).
SE ROMPE SI: Productos cambia el prefijo «familia:» de su lista de color: lo vigila una prueba en existencias-filtros.test.ts.
```

## 4. Cómo se verificó

- Pruebas puras: `lib/existencias-filtros.test.ts` (URL, chips, y **cada número de opción = lo que trae la lista al elegirla**,
  en 8 escenas con texto, familias, varias tallas, Hoy y Condición), `lib/existencias-hoy.test.ts` (toda combinación cae en un
  solo caso), `lib/existencias-prendas.test.ts`, `lib/existencias-catalogo-reglas.test.ts`, `lib/existencias-vacio.test.ts`.
- Navegador (base local, Chrome sin ventana a 1440 y 375 px): 52 de 52 opciones con su número igual al conteo; dos clics
  seguidos en Talla se suman; recargar y «Atrás» conservan los filtros sin pedir la página (71 ms); en el Taller no aparecen
  Hoy ni Condición y un `hoy=` de un enlace se ignora; «azul» + «Beige» queda vacío y ofrece quitar uno; sin desborde a 375 px.
- No se vio «Sin stock atrás» con datos reales: la semilla local no tiene ninguna talla así. Lo cubren las pruebas, y usa el
  mismo chip ámbar que «Por reponer».

## 5. Lo que queda fuera (tareas aparte)

- La tarjeta de arriba «Reponer a piso hoy» (`TarjetaReponerAPiso`, cifra en `inventario/page.tsx`) todavía cuenta por el
  motor (incluye «Sin stock atrás»): decisión de Felipe pendiente.
- «Reponer prenda» se enciende si OTRO color del modelo tiene algo atrás (`ExistenciasTarjetas.tsx`, `hayQueBajar`).
- `/inventario` sigue «pendiente» en la guía de foco por formularios que este trabajo no toca (`MatrizMover`, `SelectorDeAjuste`…).

## Actualización 2026-10-04 (noche) — «Por reponer» se funde en «Por colgar» (PR #787, motor del piso)

Felipe decidió (ADR-0328, «Actualización 2026-10-04 (tarde)») que **se repone cuando se acaba lo colgado de esa talla y color,
ordenado por lo que más se vende**: «en una tienda chica basta 1 por color». Hasta ese día «Por reponer» era «queda en el piso menos
de lo que se vendió en un día»; con 1 por color el motor del piso (`lib/piso-plan.ts`) nunca pide más de una colgada, y «Por reponer»
pasó a ser el mismo hecho que «Por colgar» (ninguna colgada y algo atrás) y la misma tarea (bajar una del almacén y colgarla).

```
DECIDÍ:    «Hoy» queda con TRES casos: Por colgar · Sin stock atrás · Mantener. Lo vendido decide SI una talla se cuelga (aunque
           sea extrema), nunca CUÁNTAS. Se queda «Por colgar»: es el verbo de lo que la asesora hace con la prenda en la mano, y
           la palabra que ya dicen «Para hoy», el Inicio («Por colgar hoy», «Cuelga N») y el filtro. El orden de la lista del día
           sigue: primero lo vendido ayer y hoy (de más a menos), luego lo que más se vende en su categoría × talla × familia.
DESCARTÉ:  dejar las dos palabras separando el MOTIVO («Por colgar» = la talla central, «Por reponer» = la que se vendió): una
           talla central vendida ayer cae en las dos, y dos palabras para una sola tarea es justo el problema 2 de este ADR. Y
           quedarse con «Por reponer»: es vocabulario de sistema, no de piso.
SE ROMPE SI: una sede grande pide más de una colgada por color: `REQUISITO_POR_COLOR` sube y «falta» vuelve a poder ser «queda
           poca». La tabla de `decidirTalla` sigue dando «por colgar» para lo que falta y se puede bajar, así que la palabra
           aguanta; lo que habría que volver a mirar es el aviso de «Subir prenda» y la ayuda de las tallas del Inicio, que hoy dicen «sin
           ninguna colgada».
```

Un enlace viejo con `?hoy=por_reponer` no filtra (`filtrosDeUrl` ignora un «Hoy» que no existe): la lista sale completa, nunca vacía.
