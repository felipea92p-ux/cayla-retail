# El borde de un control de la familia CAYLA · una lámina para elegir mirando (2026-10-26)

> **Decidido el 2026-10-26: Felipe eligió la C (un tono propio).** Retail ya la aplica (`borde-control` en `globals.css` y `tema.css`; ADR-0516, actualización 2026-10-26) y el contrato la guarda en `marca.colores_*`. Falta aplicarla en Dynamic. La lámina queda como constancia de lo que se miró.

Pendiente **P2** de `docs/familia/contrato.json`: en Retail el borde de un campo, un botón secundario y una casilla es `sand` (1.2:1 contra la
tarjeta); en Dynamic es `taupe` (5.6:1). WCAG 1.4.11 pide 3:1 para que un control se reconozca sin leerlo. Felipe elige mirando (la regla de
`/unificar`), así que esta lámina pone **la misma pantalla** (un formulario de gasto con búsqueda, filtros, campos, combo, área de texto, casillas,
interruptores y botones) con tres bordes, y los controles son de verdad: se escribe, se marca, se prende y se pasa el mouse. **Nada toca `apps/web` ni la base.**

Para verla: abrir `index.html` (doble clic) o servirla con el servidor `maquetas` de `.claude/launch.json` (puerto 8791). El botón «Oscuro» de la barra de arriba
cambia las tres pantallas de tema.

| | Qué es | Contraste del borde sobre la tarjeta (claro / oscuro) |
|---|---|---|
| **A · Sand** | Retail hoy: el borde es la línea decorativa | 1.2:1 / 1.4:1 |
| **B · Taupe** | Dynamic hoy: el taupe del texto secundario | 5.6:1 / 6.9:1 |
| **C · Un tono propio** | Nuevo: `#96786a` en claro y `#8d7a6e` en oscuro, el mínimo que pasa 3:1 con margen | 3.8:1 / 3.8:1 |

**Qué cambia en las tres:** solo lo que se toca o se escribe: campo de texto, monto y fecha, combo, área de texto, botón secundario, casilla e interruptor
apagado. **Qué no cambia:** la línea de la tarjeta, las tablas y las píldoras de filtro (siguen en `sand`: la tarjeta es decoración y la píldora lleva su
texto). Es la misma regla que ya tiene Dynamic («lo que se puede tocar o escribir lleva `borde-control`; lo que lleva un texto que lo identifica sigue en `sand`»).

**De dónde salen los números.** Todos se calculan en la propia página con los hex de cada columna (WCAG, luminancia relativa). Hoy fallan las cuatro
piezas en los dos temas: campo y botón secundario 1.2:1, interruptor apagado 1.6:1, casilla 2.2:1 en claro; en oscuro 1.4, 1.6, 2.0 y 2.9. C se obtuvo mezclando
`taupe` con `papel` hasta pasar 3:1 contra la página, la tarjeta **y** el campo (`hueso`) en los dos temas (sobre `hueso` quedan 3.1:1 y 3.2:1, el mínimo
de las tres superficies).

**Los estados del borde** (calcados de `campos-y-casillas.css`, con el escalón que hace falta si el reposo ya es oscuro): en A, como hoy (hover taupe al
60 %, foco tinta al 38 %); en B y C, el reposo es el borde del control, el hover sube a una mezcla de tinta y el foco es tinta (si el foco quedara en tinta
al 38 %, sería más débil que el reposo). **Al aplicarlo en el ERP, el foco no quedó en tinta plena** (la lámina no dibuja el anillo de foco de 2 px y, con el anillo, un
borde negro se leía como un doble marco): hover y foco usan la misma mezcla de tinta al 65 %, y el foco se nota por el anillo, el papel y el hilo rojo.

**Elegir:** el botón «Elegir la A/B/C» guarda la elección en este navegador y da el mensaje para Claude (`P2 = A`, `P2 = B` o `P2 = C`).

Qué pasa en cada app con cada opción:

- **A:** Retail no cambia. Dynamic o vuelve a `sand` (y deja de cumplir 1.4.11) o queda como diferencia aprobada en `producto`, con su motivo, en el contrato.
- **B:** sin token nuevo en el contrato; Retail adopta el alias `borde-control = taupe` en `.caja-cayla`, `.btn-secundario`, `.casilla-input` e `.interruptor` (`campos-y-casillas.css` y
  `globals.css`). Hay que mirar el oscuro, donde el borde queda tan claro como el texto secundario.
- **C:** token nuevo `borde-control` (claro `#96786a`, oscuro `#8d7a6e`) en el `@theme` de `globals.css`, en el bloque oscuro de `tema.css` y en la capa «marca» del
  contrato; Dynamic cambia su alias de `taupe` a ese valor. `lib/tema-tokens.test.ts` ya exige que un token nuevo exista en los dos temas y mide su contraste.

En B y C hay una segunda decisión menor: **el botón secundario**. Lleva su texto, así que WCAG no le exige el borde (Dynamic sí se lo pone). Si Felipe lo prefiere
más ligero, el botón puede quedarse en `sand` y el borde de control solo va en lo que se escribe y se marca.
