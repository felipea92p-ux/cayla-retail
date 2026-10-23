# Formidable · Catálogo ▸ Insignias ▸ la hoja «Configuración» de una campaña   (`/productos/insignias` ▸ «Configurar»; también Tienda web ▸ Campañas)

- **Fecha / SHA:** 2026-10-23 · `a47267541` (rama `claude/campaign-config-modal-mockups-f1b900`, ADR-0488) · **Dispositivo que manda:** escritorio (Mac mini); 375 px se adapta.
- **Pregunta que debería resolver (1 frase):** «¿Cuánto baja esta campaña, cuándo y en qué prendas, y a cuántas llega de verdad?» · **Protagonista:** la campaña (la etiqueta viva).
- **Veredicto en una línea:** se completa sola y sin retrocesos, pero la guía dice dos cosas a la vez en «Categorías», «prendas» cuenta distinto en la hoja y en el pase, y «Toda la familia» no marca toda la familia.

## Notas (0–10)

| Ley | Nota | Evidencia |
|---|---|---|
| 1 · Sin manual | 8 | **Observado:** el ciego completó la tarea en 8 toques, 0 retrocesos. Dudó en «Cuándo rige — Opcional» (¿tocaba las fechas?) |
| 2 · Una pregunta, una respuesta | 8 | **Medido:** 1 acción principal («Guardar»), 1 rojo (el −N % de la etiqueta). La etiqueta es la protagonista |
| 3 · Simplicidad profunda | 6 | **Medido:** «prendas» dice tres cosas: la hoja «23» (tallas por color), el pase «8 prendas y toda Vestidos, Faldas» (modelo y color, y se lee como una suma, pero son las mismas) y «114 en las tiendas» (unidades). El ciego lo notó al guardar |
| 4 · Lenguaje de tienda | 8 | **Observado:** «Sin prendas todavía · se pueden elegir: les llegarán prendas» suena a promesa; el ciego no entendió para qué estaba |
| 5 · Contenido primero | 9 | **Observado:** la etiqueta y «En caja» con una prenda real y lo que cobra la caja; el mosaico con los íconos de las categorías |
| 6 · Lo difícil, a un toque | 6 | **Medido:** el porqué del «sugerido» de Categorías vive solo en el `title` (hover): `PieGuia` sin `conFrase`. Los nombres cortados a 1024 px, igual |
| 7 · Perdonar antes que preguntar | 8 | **Observado:** nada pregunta; Cancelar sale sin guardar; Guardar se puede rehacer abriendo otra vez |
| 8 · Quitar antes de agregar | 7 | **Opinión:** la bajada «Las prendas sueltas se eligen en «Prendas»» nombra un botón que no está en la hoja |
| 9 · De punta a punta | 6 | **Medido:** «Toda la familia» deja afuera las categorías sin prendas (13 de 18 en Indumentaria); «· opcional» junto a «Sigue aquí»; «Opcional: sin fechas, rige siempre» con las fechas puestas; a 1024 px se cortan 4 nombres |
| **Total leyes** | **7,3** | promedio simple |
| **Oficio** | **8** | contraste 0 fallas, 1 primario, sin scroll horizontal; propios: casilla de familia de 20 px sin fila, «Elegir/Quitar todas» de 23 px, 4 nombres cortados a 1024 |

## Oficio visual — lo medido
**[Medido]** con `medir-oficio.js` limitado a la hoja (`[role=dialog]`), con 10 % y dos categorías elegidas:

| Comprobación | 1440 × 900 | 1024 × 768 | 375 × 812 (dedo, 44 px) |
|---|---|---|---|
| Contraste del texto | 0 fallas | — | — |
| Rojos | 1 (el «−10 %» de la etiqueta) | — | — |
| Acciones principales | 1 («Guardar») | — | — |
| Scroll horizontal | — | no | no |
| Blancos chicos propios | casilla de «toda la familia» 20 × 20 (sin fila que la agrande); «Elegir todas» / «Quitar todas» 23 px de alto | igual | las mismas dos |
| Blancos chicos de piezas del sistema (aparte) | — | — | `CampoFecha` (38 px y su botón de calendario de 20 px), `Buscador` (38 px), los botones del pie (35 px) |
| Nombres cortados | — | 4 con «…» (los más largos, p. ej. «Pañuelos y Pañoletas»), con su nombre en el `title` | — |
| Radios distintos | 9 (14, 10, 9, 8, 7, 16, 18, 999 y redondo): la mayoría de piezas del sistema; los 9 px de los descuentos de siempre son propios | — | — |
| Tamaños de texto | 9 (11 a 42 px) | — | — |
| Falsas alarmas descartadas | las cifras alineadas a la derecha («bordes casi alineados»), el número dentro de `PasoCantidad` («alturas desiguales»), el filo de la perforación de la etiqueta (desborde decorativo) | | |

También: **[Medido]** `guias:recorrer` de Insignias pasa en 15 pasos a 1440 y 375 px; `tema:auditar` (claro y oscuro, con la hoja vacía y llena): 0 hallazgos.

## Prueba ciega

| Quién | Cómo | Tarea | Resultado |
|---|---|---|---|
| Agente sin contexto (Opus) | navegador del panel, base local con datos inventados | «Halloween tiene que bajar 15 % en vestidos y faldas mientras dure su temporada» | completa en 8 toques, 0 retrocesos, 4 dudas: «Cuándo rige — Opcional» con fechas puestas; «CATEGORÍAS · opcional» junto a «SIGUE AQUÍ»; la bajada que manda a «Prendas»; para qué sirve «Sin prendas todavía · 29 categorías». Al guardar: «23 prendas» en la hoja contra «8 prendas y toda Vestidos, Faldas» y «114 en las tiendas» en el pase |
| Colaboradora real | — | — | sin probar |

**Escéptico (Opus, solo código y base):** de 9 hallazgos, 5 confirmados (H1 las dos señales, H2 «prendas», H4 la bajada, H6 los cortes a 1024, H7 la ayuda de fechas) y 4 matizados (H3 la línea sin prendas sirve, el problema es la redacción; H5 la casilla chica cumple WCAG por espaciado, no la regla del repo; H8 «En caja» se equivoca solo con precio por tienda o campaña por tienda; H9 el elegido en tinta es opinión). Lo que se nos escapó: «Toda la familia» no marca toda la familia, y el aviso de reimprimir no mira las tiendas (de antes de esta rama).

## Los 3 cambios de mayor impacto (esperan el OK de Felipe)

1. **La guía dice una sola cosa** (leyes 1, 6 y 9). Antes: «CATEGORÍAS · opcional» junto a «SIGUE AQUÍ», el porqué escondido en el hover, y
   «Opcional: sin fechas, rige siempre» con las fechas puestas. Después: «· opcional» solo cuando la guía lo marca opcional; el porqué
   del «sugerido» a la vista en el pie (`PieGuia conFrase`); la ayuda de las fechas sigue a lo escrito («Sin fechas rige siempre» si están
   vacías; «Del jue 17 oct al sáb 31 oct · bórralas y rige siempre» si no). **Se verifica:** `etiqueta-campana-guia.test.ts` + Halloween (con fechas) y una campaña vacía en el navegador.
2. **«Prendas» cuenta lo mismo en la hoja y en el pase** (leyes 3 y 4). Antes: 23 (tallas) en la hoja, «8 prendas y toda Vestidos, Faldas» en
   el pase. Después: la hoja cuenta por modelo y color, como el pase («8 prendas»), y el pase deja de sumar: «8 prendas, por Vestidos y
   Faldas» (o «3 marcadas a mano y 5 por Vestidos»). **Se verifica:** `sellos-pases.test.ts` con la frase nueva, y la hoja y el pase lado a lado con el mismo número.
3. **Categorías sin ruido ni cortes** (ley 8 y oficio). Antes: la bajada que nombra «Prendas», «les llegarán prendas», 4 nombres cortados a
   1024, la casilla de familia de 20 px. Después: sin esa bajada; «29 sin prendas a la venta · elígelas si te van a llegar»; columnas de 13,5 rem
   (a 1024 entran 2 y no se corta ninguno); la casilla de la familia y su título en una fila tocable de 32 px; «Elegir / Quitar todas» de 32 px.
   **Se verifica:** `medir-oficio.js` a 1024 (0 nombres cortados, 0 blancos chicos propios).

**Lo que sobra (ley 8):** la bajada «Las prendas sueltas se eligen en «Prendas»» (va en el cambio 3).

**Lo que no pediste y importa más:** «Toda la familia» marca solo las categorías con prendas (13 de 18 en Indumentaria). Quien prepara una
temporada para toda la familia verá llegar Poleras sin descuento. Arreglo: la casilla marca y cuenta todas las categorías activas de la
familia, también las sin prendas, con su prueba en `campana-hoja.test.ts`.

## Lista aparte (no se ejecuta)

- «En caja» toma el precio de la prenda aunque una tienda cobre más, y no mira las tiendas de la campaña ni otra campaña mayor (H8).
- El aviso de reimprimir no recibe `sedeIds` (ADR-0486, de antes de esta rama).
- Las piezas del sistema bajo 44 px con el dedo (`CampoFecha`, `Buscador`, los botones del pie): para `/unificar`.
- El elegido en tinta de los descuentos de siempre se parece a «Guardar» (opinión, sin evidencia de confusión).

## Antes de decir «listo»

- **Concurrencia:** dos equipos con la misma campaña: gana el último, sin aviso (`/chaos` NAV-05, g2: la función no tiene versión).
- **Caída externa:** si la base no responde al guardar, la hoja dice «No se pudo hablar con el servidor. Reintenta en un momento.» y sigue abierta con lo escrito (`/chaos` RS-01).
- **Persona sin contexto:** la prueba ciega (agente) la completó; una colaboradora real, sin probar.

## Historial

| Fecha | Qué | Leyes | Oficio |
|---|---|---|---|
| 2026-10-23 | primera medición, ciega y escéptico; 3 cambios propuestos | 7,3 | 8 |
