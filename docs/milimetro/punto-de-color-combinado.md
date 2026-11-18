# Ficha al milímetro: el punto de un color combinado y «+ acompañante» al editar

## 2026-11-13 · `claude/combined-colors-catalog-pov-4c7991`

**Árbol (regla 1):** no hay pieza nueva. El punto partido es el de ADR-0643 (`fondoDeMezcla`: la base en la mitad izquierda, los
acompañantes reparten la derecha) y el panel que arma la mezcla es `ArmarMezcla` (ADR-0643 / ADR-0649). Lo que cambia es dónde llegan.

| Sección | Decisión | Fuente | Cómo se mide |
|---|---|---|---|
| Espacio | Cada punto conserva el tamaño de su lugar (tarjeta de Productos, chapa de Existencias, `.vg-punto` de Vender, cápsula de la tabla). Solo cambia el fondo. | regla del repo (ADR-0358: migrar no cambia la pieza) | `getComputedStyle(punto).width` igual antes y después |
| Color | Los tonos son color de dato (`data-color-dato`): no cambian con el tema. El borde sigue siendo el de cada punto. | regla del repo (ADR-0336, punto 3) · [Norma] WCAG 1.4.11, excepción del color de dato | `punto.style.background` empieza con `conic-gradient` en una mezcla y es el hex en un color de un tono |
| Lo elegido | El aro de lo elegido (tinta) no cambia: la mezcla se distingue por su nombre, nunca solo por el medio círculo. | [Norma] WCAG 1.4.1 | `aria-label` del punto = nombre completo («Negro con crudo») |
| Texto | Corregir color: «¿El negro lleva otro color además? + acompañante»; el buscador dice «Busca el color que acompaña al negro»; la pista del panel, «Elige arriba de 1 a 3 colores que lo acompañan.» | `/textos`: verbo de la acción, lo que la persona ve | lectura en el navegador |
| Movimiento | Ninguno nuevo. El panel entra como entra el resto de la hoja. | ADR-0136 | — |
| Estados | default, hover, foco y elegido: los del punto y del combo, sin cambio. Cargando: «Usar la mezcla» → «Armando…» (`<Boton cargando>`). Error: `<Aviso tono="error">` en el panel. Sin red: el motivo bajo el panel y el botón apagado (no se arregla llenando nada). Quieto: sin movimiento propio. Vacío: «Negro con …» y la pista. Read-only: no aplica. | ADR-0611, ADR-0358 `accion.guardar` | verificado en el navegador |

Verificado en local (1440 px de contenido, claro): Corregir color arma «Negro con crudo», lo reusa al volver a armarlo («Ya existe: se elige
esa.»), lo deja elegido con su punto partido y la vista previa de códigos (`VES-0001-NEC-*`); Agregar color arma «Rojo con azul marino» con
un acompañante que la prenda ya vende. Tras guardar la corrección, el punto partido sale en la tarjeta de Productos, en la de Existencias, en
la tarjeta y el buscador de Vender. La base local se restauró a la foto.

## 2026-11-13 (b) · «+ Color combinado»

**Árbol (regla 1):** botón «Nuevo / Registrar» de la tabla (ADR-0358 `accion.nuevo`): `<Boton>` secundario, el mismo peso y la misma fila que
«+ Nuevo color». El primer paso es una placa con su pregunta y «Cancelar» (`<PieAcciones>`); el segundo es `ArmarMezcla`, sin cambios.

| Sección | Decisión | Fuente |
|---|---|---|
| Texto | «+ Color combinado»; el paso uno pregunta «¿Qué color se ve más en la prenda?» y dice «Tócalo en la carta o búscalo arriba: es la base. Después eliges de 1 a 3 colores que lo acompañan.» El buscador dice «Busca el color base». | `/textos`: la pregunta que la persona se hace mirando la prenda |
| Estados | Mientras se elige la base o se arma la mezcla, el botón no se dibuja (una sola salida a la vista, «Cancelar»), en vez de quedar apagado. La carta no marca nada con ✓ en el paso de la base. | ADR-0611 (no apagar sin motivo), ADR-0358 `modal` (una salida) |
| Movimiento | Ninguno nuevo. | ADR-0136 |

Verificado en local: en Agregar colores de una prenda que vende Azul marino, «+ Color combinado» → Azul marino → Crudo → «Usar la mezcla» deja
elegida solo «Azul marino con crudo» y ofrece 3 variantes. Base local restaurada.
