---
name: formidable
description: Lleva una pantalla o un modal del ERP al nivel «el iPhone llevado al ERP» — que una colaboradora o una encargada de sede la entienda en 5 segundos, sin manual, y que además esté impecable y alineada (CLAUDE.md «Formidable», ADR-0350). Califica la pantalla contra 9 leyes de comprensión y un eje aparte de «oficio visual» (se mide en el navegador, no es gusto), la hace recorrer a un agente ciego sin contexto, y propone los 3 cambios de mayor impacto antes de tocar nada. Orquesta /focus, /sugerir y /multi-view-responsive sin duplicarlas. Úsala al terminar o rediseñar cualquier pantalla o modal, y cuando Felipe diga «formidable», «no se entiende», «muy cargada», «que sea como un iPhone» o «al estilo Apple». Con `todo` o un módulo (`inventario`) informa el tablero; con `rapido` solo mide.
---

Lleva a nivel Formidable: $ARGUMENTS   (una ruta como `/inventario/frescura`, un modal, un módulo, `todo`, o sin argumento = lo que estás construyendo)

**Una pantalla Formidable se entiende en 5 segundos sin que nadie la explique: la persona sabe qué es, qué pasa y qué le toca hacer.**
Referente: el iPhone — pero llevado al ERP, donde se usa sobre todo con mouse y teclado en un Mac mini o un computador (**escritorio primero**;
tablet y 375 px se adaptan, no mandan). Se juzga por lo que la persona **hace**, nunca por si «le gusta». Fundamento y fuentes: `referencia/fuentes.md`.

## Candados (no se negocian)

1. **Presentación y lenguaje: analiza → propone → espera el OK de Felipe → implementa.** Nada cambia sin que lo vea.
2. **Las reglas de negocio sí puede proponerlas cambiar, con justificación — pero dinero y precios, stock y movimientos, permisos y roles, y
   comprobantes/SUNAT esperan SIEMPRE el OK de Felipe** (CLAUDE.md «Reglas de ejecución»: lo de SUNAT manda aunque Felipe no lo marcó).
3. **Nunca borra datos ni historial.** Quitar = esconder o mover, y solo si la ley 8 lo prueba.
4. **Respeta los tokens y piezas del sistema** (ADR-0169 paleta, ADR-0136 movimiento sin rebote, ADR-0149 loader único, `<Modal>`). Si algo no
   encaja, propone un ADR; no inventa un estilo local.
5. **Nada optimista en dinero, stock ni comprobantes.** Perdonar (deshacer) vale solo para estado de interfaz.

## Las 9 leyes (el orden es la prioridad cuando dos chocan)

1. **Sin manual.** Alguien nuevo la completa a la primera, sin preguntar a nadie.
2. **Una pregunta, una respuesta.** Un protagonista, una acción principal; lo demás espera.
3. **Simplicidad profunda.** La complejidad real se *traduce a un veredicto* («va bien», «revísala»), no se esconde ni se muestra cruda.
4. **Lenguaje de tienda.** «Tú», español neutro peruano, frases cortas; cero estadística ni jerga interna a la vista.
5. **Contenido primero.** La interfaz se retira: la prenda (Inventario), el cliente (Ventas), el dinero (Finanzas) pesan más que los marcos. Ver antes que leer.
6. **Lo difícil, a un toque.** El «¿Por qué?» existe, vive bajo un toque (nunca solo con hover) y no está a la vista por defecto.
7. **Perdonar antes que preguntar.** Se confirma solo lo irreversible; lo reversible ofrece Deshacer.
8. **Quitar antes de agregar.** Calidad sobre cantidad: si un elemento no ayuda a decidir, se propone esconderlo o quitarlo.
9. **De punta a punta, hasta el último detalle.** Estados vacíos, errores, primer uso, cargando y 375 px se cuidan como la pantalla principal.

Cada ley, con su prueba de «pasa / falla» y un ejemplo real: `referencia/leyes.md`.
**Oficio visual (eje aparte, nota propia):** alineación, espaciado, jerarquía, controles, contraste, foco, teclado. Se **mide** en el navegador:
`referencia/oficio-visual.md` + `referencia/medir-oficio.js`.

## Método (cada paso deja evidencia con etiqueta: **Medido** / **Observado** / **Opinión**; sin evidencia no hay nota)

0. **Terreno.** `git fetch origin`; `docs/SESIONES-ACTIVAS.md`; si existe `docs/pantallas/<slug>.md`, léelo. La finalidad de la pantalla sale de
   `docs/`, nunca de la captura (como `/pantalla`). Anota qué dispositivo manda según el tipo de pantalla.
1. **Medir** (Medido). `referencia/medir-oficio.js` con `javascript_tool` a **1440 × 900 primero**, luego 1024 × 768 y 375 × 812. Y los escáneres que
   ya existen, sin reescribirlos: `pnpm focus`, `pnpm sugerir`, `node scripts/rendimiento/ui.mjs --ruta <x>`.
2. **Prueba ciega** (Observado). Un agente sin contexto recorre la pantalla; después, si Felipe puede, una colaboradora real. Observa lo que
   **hace**, no lo que opina: `referencia/prueba-ciega.md`.
3. **Calificar.** 0–10 por cada ley y por «oficio», más el total. Plantilla: `referencia/informe.md`.
4. **Proponer los 3 cambios de mayor impacto** (no 12), con «antes → después», qué ley arreglan y cómo se verifica; una línea de «lo que sobra»
   (ley 8) y una de «lo que Felipe no pidió y importa más». El resto va a una lista aparte, sin ejecutar.
5. **Esperar el OK.** Con él: implementa → vuelve a medir → entrega captura **antes/después al mismo ancho** y las dos notas.

**Costo (Felipe eligió «medio»): hasta 4 agentes, y dile la escala ANTES de lanzarlos** (ya cortó un workflow grande por consumo): ① medidor
(DOM a 3 anchos) · ② ciego · ③ revisor de leyes (código + captura) · ④ escéptico que intenta refutar cada hallazgo. Con `rapido`: solo el
paso 1, sin agentes. Usa `Agent`, no `Workflow`, salvo que Felipe lo pida.

## Salida y tablero

Informe en `docs/formidable/<slug>.md` (historial, no se sobrescribe) y su fila en `docs/formidable/README.md` (tablero módulo por módulo).
**Es obligatoria con tablero, sin prueba en el CI al inicio:** al terminar una pantalla o modal, ofrece correrla. Cuando madure y se sepa qué es
«bueno», una prueba fallará el CI como `/focus` y `/sugerir` (decisión pendiente de Felipe). Orden de despliegue: módulo por módulo, el piloto es
**Inventario ▸ Frescura del piso**. Una pantalla no es Formidable porque sus modales lo sean, ni al revés.

## Antes de decir «listo» (CLAUDE.md global)

Responde con evidencia: **concurrencia** (dos personas, mismo registro), **caída externa** (qué se ve si la base o SUNAT no responde) y
**persona sin contexto** (la prueba ciega lo respondió, o dilo: «sin probar»).
