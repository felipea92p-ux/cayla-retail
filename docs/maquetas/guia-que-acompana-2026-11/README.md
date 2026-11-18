# La guía de foco que acompaña sin parecer error (2026-11-05)

Felipe: «siento que es muy llamativa y con un color rojo que indica error más que una guía; incluso muchas veces es bastante invasiva».
Es la guía de foco (ADR-0284). Para abrir: `index.html`, o el servidor «maquetas» de `.claude/launch.json`. Nada se guarda y los datos son inventados.

**Felipe eligió A, El hilo (2026-11-05)**, con las conductas que venían encendidas: ya está en el código (ADR-0284, actualización j). La maqueta queda como registro.

## Qué se elige

| | Cara | Ganas | Pagas |
|---|---|---|---|
| X | Como está hoy: recuadro y pastilla rojos | Es la referencia | Se confunde con el error, salta y mueve la hoja |
| A | El hilo: línea fina de tinta al costado y «Sigue» | Ocupa casi nada, misma idea que el canto de las listas | En una hoja larga se nota menos que un recuadro |
| B | Filo pizarra: recuadro fino y ajustado | Se encuentra de lejos, como hoy, sin parecer error | Sigue siendo un recuadro: es la que más se nota de las tres |
| C | Solo la marca: el punto y la caja que sube | La hoja más tranquila | Es la que más le puede costar a alguien nuevo |
| D | La raya: una raya de tinta bajo la caja, la misma que sale con el cursor | Es la pieza de siempre, nada nuevo que aprender | Es chica: en una hoja llena cuesta más encontrarla |
| E | La gota: la caja se despega un poco, con su sombra | Habla el idioma del vidrio: lo que sobresale es lo que toca hacer | Se puede confundir con un botón |
| F | Lo demás baja: el campo queda igual y el resto se atenúa | Sin color ni adornos, y el ojo va solo | Lo atenuado parece apagado |
| G | La etiqueta: una etiqueta colgante que dice «Sigue» | Se ve al instante y es muy de CAYLA | Es un objeto más: con el uso diario puede cansar |
| H | La costura: una puntada alrededor, en taupe | Tiene oficio y no parece error | Si los círculos opcionales se quedan, el punteado significa dos cosas |
| I | El señalador: una sola flecha que viaja al campo siguiente | El movimiento dice «ahora aquí» sin pintar nada | Si estabas mirando a otro lado, es fácil perderla |
| J | La barra: nada en el campo, una barra de avance en el pie | Responde «cuánto me falta» de un vistazo | El campo no se señala: hay que leer abajo y buscarlo |

Además de la cara, ocho conductas se prenden y apagan por separado desde la barra. Valen para las diez nuevas; X se queda como hoy.

| Conducta | Qué hace | Encendida al abrir |
|---|---|---|
| El cursor apaga la luz | Con el cursor en la caja que sigue, la línea o el recuadro se apagan: el cursor ya indica dónde estás | Sí |
| Cede si escribes en otro campo | Si escribes en «Notas», la luz no se queda en otro campo | Sí |
| La hoja no se mueve sola | Solo se desplaza al tocar lo que falta o al intentar guardar. El pie queda pegado abajo, para no perder lo que sigue | Sí |
| «Falta» discreto | Al abrir dice «Sigue: Nombre · quedan 3 más». La lista completa sale al intentar guardar. Lo que no se escribe a mano (el nombre del padrón) no se le pide a la persona | Sí |
| Opcionales sin círculo | Quita el círculo que gira; el texto ya dice «Opcional». Revierte ADR-0136 act. c | Sí |
| Hilo del cursor en tinta | El hilo bajo la caja con el cursor deja de ser rojo. Toca la pieza `campo` (ADR-0358), también fuera de la guía | Sí |
| Anillo del cursor difuminado | Cambia la línea oscura alrededor de la caja por un borde más firme y un halo. Toca la pieza `campo` en todo el ERP | Sí |
| Hoja corta: solo marcas | En una hoja de pocos campos, sin línea ni recuadro. Falta definir desde cuántos campos | No |

## Al llevarte a un campo

Al tocar «Guardar» con algo vacío, o una cosa de «Falta», hoy el bloque entero se tiñe sin esquinas redondas y se ve como un rectángulo (`[data-campo][data-llamado]` en `alta-guia.css`). Las caras nuevas usan una luz difuminada que nace del centro del campo y se va sola. **Felipe la aprobó el 2026-11-05: es la que va al ERP, sea cual sea la cara que se elija.**

## Cómo se prueba

- Lo de atrás de cada hoja es una pantalla neutra, sin colores de prenda: las baldosas de color se veían como rectángulos detrás de los campos y parecían parte de la guía.
- **Todas** muestra las caras lado a lado, cada una con su propio estado, y se ven más chicas si la ventana no alcanza. Una letra muestra esa sola a tamaño real, con el cursor puesto como en el ERP.
- **Me gusta** en cada cara y **Me gustan (n)** en la barra sirven para ir descartando y comparar solo esas. Las marcas se borran al recargar la página.
- **A la vez:** «Llenar lo que sigue» avanza un campo en todas e «Intentar guardar» muestra el error junto a la guía: es la prueba del rojo.
- Un solo cursor existe en la pantalla: para ver «el cursor apaga la luz», escribe en una hoja o abre una sola cara.

## Qué reproduce X, y qué no

Medido contra el ERP en la misma sesión: la caja de «Código» baja 15,5 px cuando le llega la luz (169,2 → 184,7 aquí; 235,2 → 250,7 en el ERP), y la hoja se desplaza sola al elegir Familia (unos 170 px aquí, 168 px en el ERP). Colores, medidas y orden salen de `alta-guia.css` y `recetas.css`.

Simplificado a propósito: «Ya existe» de Nuevo color, la búsqueda real de los combos y el padrón (aquí trae un nombre inventado).
X y las demás usan el botón que avisa al tocarlo (`confirma`, ADR-0611), aunque el Nuevo color real todavía lo apaga, para que el error se pueda comparar.

## Si se elige una, qué cambia en el código

- **Cara:** `--filo-luz-*` en `vidrio/recetas.css`, las reglas `hilo-*` en `alta-guia.css` y `.hoja-cobro-paso.sigue-aqui` en `vidrio/vender.css`. **Vender cambia también**, porque comparte la receta; esta maqueta no dibuja sus pasos y hay que mirarlos antes de cerrar.
- **Conductas:** `CampoGuiado`, `useGuiaCampos`, `PieGuia` y `lib/guia-campos.ts`, más el `FilaAlta` de Nuevo producto. No cambia qué se puede guardar.
- **Reglas que se escriben de nuevo:** CLAUDE.md «Guía de foco», ADR-0284, ADR-0136 si salen los círculos, y `.claude/skills/focus/SKILL.md`, que hoy dice «sin rojo» y describe la cara anterior.

## Falta antes de llevarla al código

- Probar la elegida con una colaboradora real: la guía nació porque una trabajadora «no sabía por dónde ir», y las caras más silenciosas (A, C, D, F, I y J) pueden no alcanzarle a alguien nuevo.
- Medir el contraste con `pnpm --filter web tema:auditar` en claro y oscuro.
- Mirarla en chips, interruptor, un paso de Vender y Nuevo producto, que la maqueta no trae.
