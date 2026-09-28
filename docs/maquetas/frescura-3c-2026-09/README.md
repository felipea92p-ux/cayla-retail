# Frescura del piso · maqueta del paso 4 (2026-09-28)

`frescura.html` se abre directo en el navegador (doble clic; sin build ni servidor). Es la pantalla
«Frescura del piso» de Inventario tal como la armaría el paso 4 de ADR-0208, sobre la lectura del paso 3
(`lib/frescura-reglas.ts` de la rama `claude/frescura-3c-lectura`, revisión 8). Sirve para una sola cosa:
**que Felipe elija colores y frases antes de construir la pantalla real.**

**Todas las cifras, prendas y fechas son simuladas** (Tienda TRU, lunes 28 de setiembre). Las prendas se
inventaron para que aparezcan TODOS los estados y TODAS las sugerencias al menos una vez; los números de
cada una salen de las mismas reglas del paso 3 (`estaQuieta`, `sugerenciasDe`, `estadoFrescura`,
`cifrasSede`), no de producción.

## Qué tiene que elegir Felipe

El panel oscuro «Elige» (abajo a la izquierda; en el celular, abajo y plegado) **no existe en el ERP**:
cambia la maqueta en vivo y arma la respuesta. Basta con contestar, por ejemplo, **«colores B, frases A»**
(el botón «Copiar» la deja en el portapapeles).

**Colores de los estados** (tramos, estados especiales y la regla del detalle):

| | Opción | Gana | Paga |
|---|---|---|---|
| A | Semáforo cálido: verde → neutro → ámbar → rojo profundo solo en texto | Se lee de lejos y habla el idioma de los chips de Compras. | El ámbar dice tres cosas: Envejecida, «Pocos datos» y «Temporada pasada». |
| B | Sobrio: tinta, pizarra y taupe; rojo solo en Crítica y una vez en la cifra | Lo único con color de alarma es lo Crítico; la pantalla se ve tranquila. | Nueva y Vigente casi no se distinguen de lejos. Gasta 1 de los 2 rojos. |
| C | Barra de edad: cuatro tramos que se llenan, sin chips de color | Se entiende sin aprender colores; sirve impresa y con daltonismo. | Cuesta más encontrar las críticas de un vistazo; los estados especiales quedan en texto gris. |

**Frases** (encabezado, la frase de la comparación, los nombres de los estados especiales, las 6
sugerencias, «al menos», «aún sin referencia» y la rapidez):

| | Juego | Gana | Paga |
|---|---|---|---|
| A | Pregunta corta («¿La cambias de lugar 7 días?») | Todo cabe en una línea y suena a pregunta, no a orden. | El porqué vive en el detalle. |
| B | Lista de opciones («Cambiar de lugar 7 días») | Menú parejo, el tono más neutro. | Suena a sistema; un infinitivo suelto puede leerse como tarea asignada. |
| C | Con el porqué («No se mueve: pruébala 7 días en otro lugar») | Cada sugerencia trae su razón; la rapidez se dice «como las demás». | Frases largas: la columna se ensancha y en el celular ocupan dos líneas. |

Lo que NO cambia con la elección: los nombres de los tramos (Nueva, Vigente, Envejecida, Crítica), la
etiqueta ámbar «Temporada pasada» (ADR-0246), los niveles de confianza («Pocos datos» ámbar, «Aceptable»
gris, «Sólido» sin etiqueta) y que «Rebajar» no existe.

## Cómo se recorre

- Tocar una fila abre la hoja de detalle (el efecto de `<Modal variante="hoja">`, ADR-0136): el porqué del
  estado en palabras de tienda, **dónde cae la prenda entre las demás de su categoría** (una regla con los
  cortes de la categoría SIN ella), la rapidez en palabras, las tallas y qué puede hacer.
- La cifra «Por decidir» y la píldora del mismo nombre filtran. Categoría y Estado son combos del ERP (sin
  `<select>`; Estado tiene 10 opciones y por eso trae buscador, ADR-0209). Escape cierra primero la lista y
  después la hoja.
- Los botones no navegan: un aviso dice a qué pantalla irían.
- Para capturas: `?colores=A|B|C&frases=A|B|C&abrir=<prenda>&elige=0|1&pordecidir=1`. Las prendas: `killa`,
  `paracas`, `wayra`, `nazca`, `chaska`, `sumaq`, `tikay`, `inti`, `qori`, `ayni`, `mayu`, `pachamama`,
  `qocha`, `illari`.

## Qué muestra cada prenda simulada

| Prenda | Lo que demuestra | Sugerencias |
|---|---|---|
| Blusa Killa | Nueva, rápida | — |
| Blusa Paracas | Vigente, a su ritmo | — |
| Blusa Wayra | Vieja y lenta, con almacén y comparación sólida (37 ventas del resto) | cambiar de lugar, trasladar |
| Blusa Nazca | Pilar con temporada pasada (llegó a CAYLA el 14 may; su otoño-invierno terminó el 22 set) | sigue vendiendo |
| Blusa Chaska | Vino en la carga inicial: edad desconocida, nunca «Nueva» | — |
| Blusa Sumaq | El libro no cuadra (talla M en −1): no se juzga | (contar) |
| Enterizo Tikay | Su categoría no vende en Trujillo: solo días colgada + referencia de CAYLA; sin temporada | — |
| Pantalón Inti | «Al menos Envejecida»: pasó lo más largo que se vio (57 d) y la curva no llega a 9 de 10 | cambiar de lugar (sin trasladar: la comparación es «Aceptable») |
| Pantalón Qori | Vigente; sin temporada | — |
| Jean Ayni | Callada: «al menos Vigente» (carga inicial) y 30 días en el piso sin vender | revisa sus ventas |
| Pantalón Mayu | Todo apartado (3): no envejece ni recibe sugerencias; pilar sin una sola boleta | — |
| Vestido Pachamama | Aún sin referencia: 5 de las 7 ventas de vestidos son suyas; sin ella, 2 de 12 (D5) | — |
| Vestido Qocha | Clásico de verano fuera de su estación | guárdala hasta su estación |
| Vestido Illari | Temporada pasada, lenta y callada, «al menos Vigente» | revisa sus ventas, cambiar de lugar, retirar |

Cuatro categorías y no tres: el estado «sin ventas de su categoría en la sede» es de la categoría entera,
así que necesita una categoría sin ventas (Enterizos).

## Decisiones de la maqueta que Felipe puede objetar

- **D5 se dice en tres lugares:** bajo los filtros («Cada prenda se compara con el resto de su categoría,
  sin contarse a sí misma»), en la nota y en el detalle, con los cortes de la categoría sin ella al lado de
  los de la cabecera.
- **La cabecera de cada categoría** dice su comparación en palabras, los días de cada tramo y con cuántas
  ventas se hizo; debajo, la referencia de CAYLA (las 3 tiendas juntas) como apoyo.
- **Lo que solo es del líder** (el registro al colgar bajo la frase y la referencia de CAYLA) lleva el chip
  «Solo líder», para el día en que el módulo se le dé a otro rol.
- **Lo que solo está en el almacén** (nunca colgado) no entra a la tabla: se nombra al pie, «no se mide hasta
  que se cuelgue». La lectura lo trae como «Nueva» con 0 días; mostrarlo así sería mentir.
- **Apartada** conserva el tramo con que se apartó («iba en Vigente») y dice «3 apartadas»; los días dicen
  «en pausa».
- Un filete gris a la izquierda marca las filas «Por decidir».
- El resumen de la sede va sin sombra (el `ResumenSede` del ERP tiene una suave): la regla de esta pantalla
  es no poner sombra en lo que va pegado al fondo.

## Reglas del ERP que respeta (y cómo se comprobó)

- **Colores:** solo los tokens de `apps/web/app/globals.css`, copiados tal cual en `:root`; los tintes son
  `color-mix(token N %, transparent)`, igual que `bg-verde/15`. Un `grep` de colores literales devuelve solo
  esas líneas de `:root`.
- **Rojo pleno:** el panel lo cuenta en vivo: A 0, B 1 (la cifra «Por decidir»), C 0. Los tintes al 10 % y el
  rojo profundo no cuentan, como en el Chip del ERP.
- **Contraste medido (WCAG, sobre papel y sobre la cebra de la tabla):** verde profundo sobre su tinte
  5,90 / 5,39; ámbar profundo 5,55 / 5,06; rojo profundo sobre rojo 10 % 7,02 / 6,40; pizarra 5,16 / 4,71;
  taupe sobre sand 4,50; taupe como texto 5,58 / 5,05. El chip «Apartada» va con texto en tinta: en taupe
  sobre su propio tinte caía a 4,16 en la cebra.
- **Movimiento:** la cabecera sube y el hilo se dibuja al llegar; la hoja entra como `<Modal>` (velo 220 ms,
  hoja 420 ms subiendo 18 px, cascada de 55 ms) y sale en 220 ms; en el celular sube desde abajo. Con
  «reducir movimiento» todo es instantáneo.
- **Anchos:** 1280 px sin desplazamiento; entre 821 y 1279 px la tabla se desliza dentro de su tarjeta, como
  `Tabla`; en el celular cada prenda es una tarjeta. A 375 px ninguna de las 9 combinaciones ni las 14
  hojas desplazan la página de lado (comprobado en el navegador).

## Lo que queda fuera

- **La pregunta 8** (los dos bikinis gemelos, uno del lote y otro de la carga inicial) no está en la maqueta:
  es una regla, no un color ni una frase.
- «Ventas a pedido» dice «sin datos todavía»: llega con el bloque 3b.
- El selector de sede y «Ver las 3 tiendas» no navegan.

Decisiones: `docs/adr/0208-frescura-del-piso.md` (rama `claude/frescura-3c-lectura`: «Cierre del paso 3»,
«Revisión 7», «Revisión 8»). La maqueta original de la idea: `docs/maquetas/frescura-del-piso-2026-09/`.
