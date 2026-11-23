---
paths:
  - "docs/milimetro/**"
  - "docs/formidable/**"
  - "docs/maquetas/**"
  - "scripts/milimetro/**"
  - "apps/tienda/**"
  - ".github/workflows/al-milimetro.yml"
---

## Al milímetro: la base teórica del diseño (regla — Felipe 2026-11-12)

**Es OBLIGATORIA para todo el que trabaje en el repo, con Claude Code o con cualquier herramienta (Felipe 2026-11-12: «cada que se haga
un cambio visual o se cree una nueva pantalla o se quiera auditar las pantallas ya existentes se usen esas skills obligatoriamente»):**
- **Pantalla, modal o pieza nueva:** `/milimetro diseñar <pieza>` ANTES de escribir el código; la ficha que sale es lo que se construye.
- **Cambio visual a algo que existe** (medidas, letra, color, estados, movimiento, textos o un gráfico): `/milimetro auditar <ruta>` al
  terminar, en local, y se arregla lo grave antes del PR.
- **Auditar pantallas existentes:** siempre con `/milimetro auditar <ruta|módulo>`, nunca a ojo ni con una skill de afuera.
- **El PR lo dice:** su casilla «pasó por `/milimetro`» (o «Al milímetro no aplica», con el motivo). El check **«Al milímetro»**
  (`.github/workflows/al-milimetro.yml`, `scripts/milimetro/casilla.mjs`) sale rojo si un PR cambia un `.tsx` de `apps/web/components/`
  o `apps/web/app/`, o un `.css` de `apps/web/app/`, sin marcar ninguna. La tienda (`apps/tienda`) queda fuera: tiene su identidad (ADR-0616).
- **La auditoría queda solo en su informe** (`docs/milimetro/auditorias/AAAA-MM-DD-<tema>.md`, con su título y su línea `Resumen:`), sin fila
  en `docs/milimetro/README.md`: el CI la rechaza (ADR-0259, act. 2026-11-17). El tablero se arma solo: `pnpm milimetro:auditorias`.
- **Va antes que las demás de interfaz y no las reemplaza:** primero `/milimetro` (la medida y el porqué), después `/formidable` (se
  entiende en 5 s), `/focus`, `/sugerir`, `/guia` y `/chaos` según lo que toque. Lo que una skill de afuera sugiera pasa por aquí.

**Siete skills de este repo dan el porqué y la medida exacta de cada componente, gráfico, texto y animación:** `/milimetro` (la entrada:
arma la *ficha al milímetro* de una pieza y audita una pantalla), `/movimiento`, `/tipografia`, `/espacio`, `/color`, `/graficos` y
`/textos`. Cada regla trae su valor, el token o la pieza del repo que la cumple y su nivel de confianza —**Evidencia** (estudio),
**Norma** (WCAG, especificación) o **Práctica** (sistemas de diseño)—, y cada skill trae un `referencia/medir.js` para el navegador.
La investigación vive en `docs/investigacion/2026-11-12-fundamentos-de-diseno/`.
1. **`CLAUDE.md` y `.claude/rules/` mandan sobre ellas:** los tokens, las piezas de «Una función, una pieza» y las reglas de movimiento siguen siendo la
   fuente; las skills no traen ni un hex, una letra ni una pieza propia.
2. **Donde la investigación dice que una regla de aquí se puede mejorar, la skill no la cambia: la propone** (Felipe: «reescribimos
   las reglas siempre y cuando sea una mejora… si es la forma en que lo hacen los mejores del mundo, hagámoslo»). El tablero es
   `docs/milimetro/propuestas.md`; se decide mirando, con `/milimetro proponer`, y lo elegido entra por su ADR.
3. **No reemplazan a `/unificar`, `/formidable`, `/focus` ni `/sugerir`:** las alimentan con fundamento y les pasan la posta.

## Formidable: el iPhone llevado al ERP (regla — ADR-0350, Felipe 2026-10-05)

**Una pantalla o un modal se entiende en 5 segundos sin que nadie lo explique: la colaboradora o la encargada saben qué es, qué pasa y qué les
toca hacer.** Hoy se usa sobre todo desde un Mac mini o un computador con mouse y teclado: **escritorio primero**, tablet y 375 px se adaptan
(Vender, Cambios y Devoluciones conservan el celular obligatorio, PL-105). Se califica con dos notas separadas de 0 a 10:
- **9 leyes** (el orden es la prioridad si chocan): 1 sin manual · 2 una pregunta, una respuesta · 3 simplicidad profunda (la complejidad se
  *traduce a un veredicto*, no se esconde ni se muestra cruda) · 4 lenguaje de tienda («tú», español neutro peruano; cero estadística ni jerga a la
  vista) · 5 contenido primero (ver antes que leer) · 6 lo difícil a un toque en «¿Por qué?» (nunca solo con hover) · 7 perdonar antes que
  preguntar (se confirma solo lo irreversible: dinero, stock, comprobantes, borrado) · 8 quitar antes de agregar · 9 de punta a punta (vacíos
  que dicen qué falta, errores en tres líneas, cero tours, 375 px).
- **Oficio visual**, que se mide en el navegador y no es gusto: alineación, espaciado en múltiplos de 4, jerarquía, contraste, foco, teclado; controles de
  24 px mínimo (32 de objetivo) con mouse y 44 con dedo.

**`/formidable` (skill) hace el recorrido:** mide → prueba ciega con un agente sin contexto (y 3 a 5 colaboradoras reales) → califica con evidencia
**Medido / Observado / Opinión** → propone los **3** cambios de mayor impacto → **espera tu OK** → implementa → entrega antes/después al mismo ancho.
Puede proponer cambiar reglas de negocio, pero **dinero y precios, stock y movimientos, permisos y roles —y comprobantes/SUNAT— esperan
siempre el OK de Felipe**. Respeta los tokens (ADR-0169), el movimiento sin rebote (ADR-0136) y el loader único (ADR-0149); orquesta `/focus`,
`/sugerir` y `/multi-view-responsive` sin duplicarlas. **Es obligatoria con tablero, todavía sin prueba en el CI:** al terminar una pantalla o un
modal, corre `/formidable`; el avance módulo por módulo vive en `docs/formidable/README.md` (piloto: Inventario ▸ Frescura del piso). Detalle:
`docs/adr/0350-formidable-el-iphone-llevado-al-erp.md` y `.claude/skills/formidable/`.

## Skills de diseño de afuera: se consultan, no mandan (regla — Felipe 2026-10-17)

**`frontend-design` (Anthropic), `ui-ux-pro-max`, `better-ui` (Jakub Krehel) y `modern-web-guidance` (Google Chrome) solo se consultan: nunca mandan sobre los colores ni sobre las piezas ya decididas.**
Las dos primeras no viven en el repo (cada quien las instala en su `~/.claude/skills/`); `better-ui` y `modern-web-guidance` sí (`.claude/skills/`, con esta regla escrita arriba). `modern-web-guidance` se dice «MANDATORY» y empuja la plataforma pura (`<dialog>`, `<select>` con `base-select`, `light-dark()`, `matchMedia`): aquí gana la pieza decidida, y lo nuevo que valga se prueba en una maqueta de `docs/maquetas/` antes de cambiar una regla (Felipe 2026-11-18). Todas se activan solas en casi cualquier tarea de interfaz y empujan
a elegir una estética propia —fuentes, paletas, estilos—. Si lo que sugieren choca con `CLAUDE.md` o con `.claude/rules/`, ganan esas reglas:
1. **En el ERP (`apps/web`), colores y letras:** solo los tokens de `apps/web/app/globals.css` con su oscuro en `estilos/tema.css`
   (ADR-0169 y ADR-0336). Nunca una paleta, un hex ni una fuente que proponga la skill.
2. **En el ERP, piezas y movimiento:** la tabla de «Una función, una pieza» (ADR-0358) y la regla de ADR-0136. Una sugerencia de la skill
   no reemplaza una pieza decidida ni abre otra variante; una idea que valga para el ERP pasa por `/unificar` y Felipe la elige mirando.
3. **La tienda online (`apps/tienda`) puede tener identidad visual propia** (Felipe 2026-10-17, al pedir su rediseño completo): ahí las
   skills SÍ proponen paleta, letras y estilo, pero siempre como 2 o 3 direcciones en maquetas tocables (`docs/maquetas/`) que Felipe
   elige mirando, nunca directo en el código. Lo elegido se escribe en `apps/tienda/app/globals.css`, que sigue siendo la única fuente
   de la tienda; desde ahí, la tienda se trata como el ERP (nada se reinventa pieza por pieza). El logo y el colibrí son la marca y no
   se rediseñan sin que Felipe lo pida, y lo que decida la tienda no viaja al ERP.
4. **Nunca `--persist`, en ninguna de las dos apps:** `ui-ux-pro-max` no crea `design-system/<proyecto>/MASTER.md` ni sus `pages/*.md`.
   Se presenta como «fuente de verdad» y sería una segunda, compitiendo con los `globals.css`, los ADR y `docs/unificar/`; una carpeta
   `design-system/` no entra a un commit.

Sirven, además, para lo que el repo no decide: criterios de accesibilidad y de UX, cómo elegir un gráfico, ideas para una maqueta en
`docs/maquetas/`. La búsqueda de `ui-ux-pro-max` está en inglés (en español no encuentra nada) y nunca lleva datos de CAYLA.
