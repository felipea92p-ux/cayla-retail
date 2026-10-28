## 2026-10-05 (El foco de teclado deja de ser azul, rojo pálido o invisible: un solo anillo negro de 2 px — ADR-0351)
Qué hice: el informe de `/formidable` decía que el foco por teclado era débil en piezas compartidas. Lo medí en el navegador, por píxeles
(captura sin y con foco, contraste de lo que cambia): combos y buscador 2,10:1 con un borde de 1 px, la pastilla de la sede 0 píxeles
(sin indicador), las filas de Frescura 2,04:1. **Una afirmación se refutó:** la cifra de `ResumenSede` sí mostraba un anillo, el azul
por defecto de Chrome. Resultó que casi todo el ERP dependía de ese azul o de anillos rojos/tinta con 30–60 % de opacidad (1,4 a 2,5:1).
Ahora `globals.css` define UN anillo —tinta, 2 px, 2 px de separación— para todo `:focus-visible`, más una regla sin capa para la
caja y la fila (le gana al `outline-none` de cada control) y se borraron los anillos propios de las piezas compartidas (`Boton`, combo,
`BotonCompacto`, píldoras, `FrescuraFila`…) y de lo que apareció al recorrer Existencias y Vender con Tab. Un candado
(`lib/foco-comun.test.ts`) impide que una pieza compartida vuelva a escribir el suyo.
Por qué así: el rojo es el acento «sagrado» (máx. 2 por pantalla) y el foco aparece en cada Tab, así que se usó tinta (13 a 16:1 sobre las
superficies). Una regla universal con `!important` habría dibujado anillos sobre hojas y títulos que se enfocan a propósito.
Felipe se lleva: quien navega con teclado ve siempre dónde está, igual en Chrome y en Safari. Quedan 64 anillos propios viejos en 47
archivos (la prueba solo deja bajar la cuenta) y el foco de Finanzas, que sigue el spike (ADR-0195) y espera su decisión.
