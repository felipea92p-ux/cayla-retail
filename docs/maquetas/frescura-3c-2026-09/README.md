# Frescura del piso · maqueta del paso 4 (2026-09-28)

`frescura.html` se abre directo en el navegador (doble clic; sin build ni servidor). Es la pantalla
«Frescura del piso» de Inventario tal como la armaría el paso 4 de ADR-0208, sobre la lectura del paso 3
(`lib/frescura-reglas.ts` de la rama `claude/frescura-3c-lectura`, revisión 8). Sirve para una sola cosa:
**que Felipe elija colores y frases (y conteste la pregunta 8) antes de construir la pantalla real.**

**Todas las cifras, prendas y fechas son simuladas** (Tienda TRU, lunes 28 de setiembre; la lectura mira
120 días, desde el 31 de mayo). Las prendas se inventaron para que aparezcan TODOS los estados y TODAS las
sugerencias al menos una vez; los números de cada una salen de las mismas reglas del paso 3
(`estaQuieta`, `sugerenciasDe`, `estadoFrescura`, `cifrasSede`), no de producción.

## Qué tiene que elegir Felipe

El panel oscuro «Elige» **no existe en el ERP**. En escritorio vive sobre el menú lateral (su ancho, para no
tapar la tabla); sin menú lateral va abajo a todo el ancho, plegado. Cambia la maqueta en vivo y arma la
respuesta. Basta con contestar, por ejemplo, **«colores B, frases A, pregunta 8: recomendada»** (el botón
«Copiar» la deja en el portapapeles).

**Colores de los estados.** Ninguna opción pone rojo en una fila (ver «Rojo», abajo). Lo que no es un tono
de `components/ui/Chip.tsx` (`neutro`, `ambar`, `verde`, `rojo`, `pizarra`, `apagado`) es un tono NUEVO que
habría que sumar al componente, con su ADR, antes de construir:

| | Opción | Nueva · Vigente · Envejecida · Crítica | Tonos nuevos | Gana | Paga |
|---|---|---|---|---|---|
| A | Semáforo cálido | `verde` · `neutro` · `ambar` · **contorno tinta** | 1 | Se lee de lejos y habla el idioma de los chips de Compras. | El ámbar dice tres cosas (Envejecida, «Pocos datos», «Temporada pasada»); la Crítica no puede ser roja. |
| B | Escala de tinta | **contorno** · `neutro` · **tinta suave** · **tinta llena** | 3 | Cuanto más vieja, más oscura: la Crítica es la única mancha llena. | Nueva y Vigente casi no se distinguen de lejos; 3 tonos nuevos. |
| C | Barra de edad | cuatro segmentos que se llenan (tinta) | pieza nueva (`BarraEdad`) | Se entiende sin aprender colores; sirve impresa y con daltonismo. | Cuesta más encontrar las críticas de un vistazo; los especiales quedan en texto gris. |

Comunes a A y B: `pizarra` = no entra a la comparación (sin comparación aquí, aún sin referencia, edad
desconocida, clásico); `apagado` con ícono = los números no cuadran; `neutro` = apartada (en pausa).
«Temporada pasada» es `ambar` en las tres (ADR-0246); «Pocos datos» `ambar`, «Aceptable» `neutro`, «Sólido»
sin etiqueta.

**Frases** (encabezado, la frase de la comparación, los nombres de los estados especiales, las 6
sugerencias, «al menos», «aún sin referencia» y la rapidez):

| | Juego | Gana | Paga |
|---|---|---|---|
| A | Pregunta corta («¿La cambias de lugar 7 días?», «al menos Vigente», «Rápida») | Todo cabe en una línea y suena a pregunta, no a orden. | El porqué vive en el detalle. |
| B | Lista de opciones («Cambiar de lugar 7 días», «Vigente o más», «Vendió 5 · se esperaban 4.8 a su edad») | Menú parejo, el tono más neutro. | Suena a sistema; la rapidez son dos números que hay que comparar. |
| C | Con el porqué («No se mueve: pruébala 7 días en otro lugar», «Vigente quizá más», «Como las demás») | Cada sugerencia trae su razón, según la causa de esa prenda. | Frases largas: la columna se ensancha y en el celular ocupan dos líneas. |

**Pregunta 8 (una regla, no un color).** ADR-0208, revisión 6: lo que llegó sin fecha (carga inicial) y se
sigue vendiendo, ¿recibe «sigue vendiendo» cuando pasa su temporada? Las dos **Blusa de lanilla Pukio** son
gemelas: la misma historia (colgadas el 2 de setiembre, 8 vendidas, otoño-invierno terminado), la Camel vino
en un lote y la Gris en la carga inicial. El panel muestra las tres salidas del ADR sobre la Gris:

| | Salida | Gana | Paga |
|---|---|---|---|
| 1 | Como hoy (revisa, cambia de lugar, retira) | Ninguna regla nueva. | En TRU, 33 de 34 modelo+color vinieron solo en la carga: todos sus éxitos recibirán «muévela» y «retírala». |
| 2 | Recomendada (sigue vendiendo) | Los gemelos reciben lo mismo. | Sin rapidez no se sabe si vende «bien» (la chompa de 1 de 4 en 42 días también diría «sigue vendiendo»). |
| 3 | Sin mover (revisa y retira) | No se le pide mover lo que se vende. | Los gemelos siguen distintos. |

**Datos de la maqueta** (no es parte de la respuesta): «En 2 meses» muestra todos los estados; «Como TRU
hoy» muestra lo que verá el primer mes: casi todo llegó en la carga inicial, 13 de 13 sin temporada, casi
nada con qué comparar, nada por decidir. Elegir colores solo con la tienda madura escondía justo el caso más
común de las primeras semanas.

## Cómo se recorre

- Tocar una fila abre la hoja de detalle (el efecto de `<Modal variante="hoja">`, ADR-0136): el porqué del
  estado en palabras de tienda, **dónde cae la prenda entre las demás de su categoría** (una regla con cada
  zona escrita y los cortes de la categoría SIN ella), la rapidez, las tallas y qué puede hacer.
- La cifra «Por decidir» y la píldora del mismo nombre filtran. Categoría y Estado son combos del ERP (sin
  `<select>`; Estado tiene 11 opciones y trae buscador, ADR-0209). Escape cierra primero la lista y después
  la hoja.
- Los botones no navegan: un aviso dice a qué pantalla irían.
- Para capturas: `?colores=A|B|C&frases=A|B|C&p8=hoy|rec|otra&datos=dia|hoy&abrir=<prenda>&elige=0|1&pordecidir=1`.

## Qué muestra cada prenda simulada («En 2 meses»)

| Prenda | Lo que demuestra | Sugerencias |
|---|---|---|
| Blusa Killa | Nueva, rápida | — |
| Blusa Paracas | Vigente, a su ritmo; 1 apartada dentro de una fila normal | — |
| Blusa Wayra | Crítica, muy lenta, con almacén y comparación sólida | cambiar de lugar, trasladar |
| Blusa Tupay | Crítica que vendió bien al llegar y dejó de venderse (índice 130, 30 días sin vender): ya no es pilar | cambiar de lugar, trasladar |
| Blusa Nazca | Pilar con temporada pasada. Llegó a CAYLA el 14 de mayo (Taller) y a TRU por traslado el 15 de agosto: la tienda ve por qué ya pasó (D1) | sigue vendiendo |
| Blusa Pukio Camel / Gris | Los gemelos de la pregunta 8 | Camel: sigue vendiendo · Gris: según el panel |
| Blusa Chaska | Llegó sin fecha y aún no pasa la mitad: edad desconocida, nunca «Nueva» | — |
| Blusa Qantu | «Al menos Crítica» (llegó sin fecha, 56 días): se dice Crítica, con los días «al menos» | revisa sus ventas (sin dato de rapidez) |
| Blusa Sumaq | El historial no cuadra (talla M): no se juzga | (contar) |
| Enterizo Tikay | Sin comparación en la sede (ningún enterizo vendido con fecha); sin temporada | — |
| Enterizo Wiñay | La misma categoría sin comparación, pero vendió 2 (llegaron sin fecha): el estado no dice «sin ventas» | — |
| Pantalón Inti | «Al menos Envejecida»: pasó lo más largo que se vio sin ella (57 d) y la curva no llega a 9 de 10 | cambiar de lugar (sin trasladar: «Aceptable») |
| Pantalón Qori | Vigente; sin temporada | — |
| Jean Ayni | Callada: «al menos Vigente» (llegó sin fecha) y 30 días en el piso sin vender | revisa sus ventas |
| Pantalón Mayu | Todo apartado (3): no envejece ni recibe sugerencias; pilar sin una sola boleta | — |
| Pantalón Sami | Clásico en su estación: fuera del semáforo, nada que decidir | — |
| Vestido Pachamama | Aún sin referencia: 5 de las 7 ventas de vestidos son suyas; sin ella, 2 (D5). La fila no dice si es rápida | — |
| Vestido Tika | Nueva en una categoría con «pocos datos» (se dice «con pocos datos») | — |
| Vestido Qocha | Clásico de verano fuera de su estación | guárdala hasta su estación |
| Vestido Illari | Temporada pasada, muy lenta y callada, «al menos Vigente»; estuvo 58 de sus 116 días sin nada libre colgado | revisa sus ventas, cambiar de lugar, retirar |

Al pie: lo que está solo en el almacén (nunca colgado) y lo guardado después de colgarse (Blusa Chumpi, iba
en Crítica).

## Reglas de la pantalla que la maqueta fija (Felipe puede objetarlas)

- **Rojo:** máximo 2 manchas por pantalla contando TODO lo rojo (pleno, profundo y tintes), igual que
  decidió `lib/productos-stock.ts` con «Sin stock». Con 3 críticas en la tienda, un chip rojo por fila ya se
  pasaba. Ninguna fila lleva rojo; el único es la zona Crítica de la regla del detalle. El panel lo cuenta
  en vivo leyendo los estilos calculados: 0 en la lista, 1 con la hoja de una prenda de blusas abierta.
- **La cifra «Por decidir» es ámbar** en las tres opciones: `ResumenSede` dice «Nunca rojo — el rojo es de lo
  urgente», y «Por decidir» incluye pilares que se siguen vendiendo.
- **Una sola escala de rapidez** para la fila y el detalle, con el corte en 100 (el de `esPilar`): 120 o más
  «rápida», 100 a 119 «a su ritmo», 60 a 99 «lenta», menos de 60 «muy lenta»; con 100 o más y 30 días en el
  piso sin vender, «dejó de venderse». Con la categoría «aún sin referencia», la fila no dice si es rápida.
- **Las sugerencias dicen su causa:** «revisa sus ventas» es distinto para la callada (30 días sin vender)
  y para la que no tiene dato de rapidez; «cambiar de lugar», distinto para la vieja y lenta, la que dejó de
  venderse y la de temporada pasada.
- **«% Nuevas» se cuenta sobre lo que se puede comparar** (el denominador del modelo), y el rótulo lo dice:
  «de lo medido es Nueva». El detalle va en el `title` y en la nota.
- **Lo que no está colgado no entra a la tabla:** lo que solo está en el almacén (la lectura lo trae como
  «Nueva» con 0 días) y lo guardado después de colgarse (queda con su estado y sin sugerencias: se vería como
  un error) se nombran al pie.
- **Sin temporada:** si más de la mitad de las prendas no tiene temporada (TRU hoy: 89 de 89), un solo aviso
  sobre la tabla en vez de un chip en cada fila.
- **Filtro Estado:** las «al menos» cuentan en su edad; «Sin comparación todavía» son las que no tienen
  ninguna; «Temporada» se cruza con las de arriba (lo dice el pie de la lista).
- **Solo el líder** ve el registro al colgar y la referencia de CAYLA: se dice una vez, en la nota. Hoy el
  módulo nace solo para el líder.
- Un filete gris a la izquierda marca las filas «Por decidir». El resumen de la sede va sin sombra (el
  `ResumenSede` del ERP tiene una suave): la regla es no poner sombra en lo que va pegado al fondo.

## Lo que la pantalla real pide y hoy no existe

- **`ResumenSede`:** el prefijo «al menos» sobre la cifra, un formato «porcentaje» (hoy solo `entero` y
  `soles`) y una cifra que filtra en la misma pantalla (`onClick` y `aria-pressed`; hoy solo `href`).
- **`Chip`:** los tonos nuevos de la opción elegida (ver la tabla de colores).
- **Datos que la lectura no trae:** el origen de la llegada a CAYLA («lote de Gamarra», «producción del
  Taller», «carga inicial»: `ultimaLlegadaCayla` es solo una fecha); qué talla no cuadra (está en la lectura
  cruda, `dudosas`, pero no en `FrescuraPrenda`); las unidades de su categoría sin ella (para decir «2 de
  12»; `categoriaSinElla` trae cortes, `tMax` y vendidas); y cuándo empieza la próxima estación de un clásico
  (la maqueta dice «hasta su estación (verano)», con el nombre que sí viene).
- **Dónde anotar una decisión:** «La dejo hasta agotar» no tiene dónde guardarse. Sin eso, una prenda
  decidida sigue en «Por decidir» cada semana, y «cambiar de lugar 7 días y medir» no tiene desde cuándo
  contar. Es un dato nuevo por sede: **pregunta abierta para Felipe.** La maqueta muestra el botón y avisa.

## Reglas del ERP que respeta (y cómo se comprobó en el navegador)

- **Colores:** solo los tokens de `apps/web/app/globals.css`, copiados tal cual en `:root`; los tintes son
  `color-mix(token N %, transparent)`, igual que `bg-verde/15`. Un `grep` de colores literales devuelve solo
  esas líneas de `:root`. Los chips existentes llevan las clases exactas de `Chip.tsx` (verde y ámbar con
  texto `verde` y `ambar`, no el profundo).
- **Contraste medido (WCAG):** un script recorre cada texto visible, compone su fondo real (cebra, tintes,
  hoja) y exige 4,5:1 (3:1 en texto grande). Pasan las 18 combinaciones de colores, frases y datos, con las
  21 hojas de «En 2 meses» y las 13 de «Como TRU hoy»; lo más justo es el chip `neutro` del propio ERP
  (taupe sobre arena, 4,50). El mismo script reproduce el 3,66 de la píldora de antes. La regla del detalle escribe el nombre de cada zona y las separa con un filete taupe (5,5:1): el
  color ayuda, pero no es lo único que dice qué zona es.
- **Palabras:** ningún «tramo», «P50», «percentil», «vara» ni «≥» en ninguna pantalla ni hoja de las 54
  combinaciones (colores × frases × pregunta 8 × datos). Los decimales van con punto, como `es-PE` en el resto
  del ERP («4.8»).
- **Movimiento:** la cabecera sube y el hilo se dibuja al llegar; la hoja entra como `<Modal>` (velo 220 ms,
  hoja 420 ms subiendo 18 px, cascada de 55 ms) y sale en 220 ms; en el celular sube desde abajo. Radio de
  la hoja 20 px (`sm:rounded-2xl` = `--radius-2xl`). Con «reducir movimiento» todo es instantáneo.
- **Anchos:** a 1280 px sin desplazamiento lateral y con la hora del hilo en su línea; entre 821 y 1279 px
  la tabla se desliza dentro de su tarjeta, como `Tabla`; en el celular cada prenda es una tarjeta con la
  leyenda de las tallas. A 375 px ninguna combinación ni hoja desplaza la página de lado, y con la hoja
  abierta el panel queda bajo el velo (el botón «Cerrar» no se tapa).

## Lo que queda fuera

- «Ventas a pedido» dice «sin datos todavía»: llega con el bloque 3b.
- El selector de sede y «Ver las 3 tiendas» no navegan.

Decisiones: `docs/adr/0208-frescura-del-piso.md` (rama `claude/frescura-3c-lectura`: «Cierre del paso 3»,
«Revisión 7», «Revisión 8»). La maqueta original de la idea: `docs/maquetas/frescura-del-piso-2026-09/`.
