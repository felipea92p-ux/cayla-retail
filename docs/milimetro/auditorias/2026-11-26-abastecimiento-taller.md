# Auditoría al milímetro — Producción ▸ Abastecimiento achicado (PR #2025, ADR-0702) · 2026-11-26 · claude/registro-costos-taller-930684 @ d4b2987c4
Medido: 1440×900 claro (vivo y quieto) · 375×812 claro · 1440 oscuro · foco con teclado (Facturas)     Servidor: `http://milimetro.localhost:3147` (worktree, sin base: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9`)
Resumen: 0 graves · 0 medias abiertas (2 corregidas) · 1 leve · 4 previos al PR · 3 decididos a propósito

Cómo se midió: una página temporal (`app/auth/prueba-milimetro`, ya borrada) dibujó los componentes reales con datos inventados. Fueron
`ComprobantesProduccionPanel` con lista (3 facturas) y vacío, y `ResumenProduccionPanel` con 2 asuntos y 3 telas (falta, alcanza, alcanza si llega).
Los seis medidores (`milimetro`, `espacio`, `tipografia`, `color`, `movimiento`, `textos`) corrieron tal cual, servidos desde la misma página y
evaluados enteros. Todo «revisar» se confirmó con `grep`. **El PR solo quita piezas:** no dibuja ninguna nueva. «Ir a Insumos» es `<BotonEnlace>`
y los chips son `<Chip>`, las dos piezas decididas.

## Graves
Ninguno introducido por el PR. Los medidores dieron 0 textos que fallan contraste (claro y oscuro), 0 blancos < 24 px y 0 desbordes a 375 px
(`scrollWidth` 375). Tampoco hay apagados ni ocupados que se puedan pulsar, letra de lectura < 13 px ni montos partibles.

## Medias
1. **El «¿Por qué?» de «¿Alcanza la tela?» todavía habla de pedidos** («“En camino” es lo que falta recibir de cada pedido»), y el subtítulo dice
   «lo que viene en camino». Desde ADR-0702 ya no se puede crear un pedido. — `components/ResumenProduccionPanel.tsx`, `PorQue guia="prod-resumen.tela-porque"`
   — medido: texto en pantalla — regla: un texto no describe lo que la pantalla ya no permite (`/textos`, «Poco texto a la vista») — [Práctica] NN/g
   — va a `/textos`. El PR tocó esta frase (le quitó «lo mismo que ves en Recibir») y dejó «pedido». Lo «facturado por recibir» sí sigue existiendo.
2. **El texto del vacío de Facturas de insumos es largo**: 2 oraciones y unas 45 palabras bajo «Todavía no hay facturas de insumos». El PR lo reescribió para decir
   de dónde nacen las facturas. — `components/ComprobantesProduccionPanel.tsx`, `<Vacio guia="prod-facturas.lista">` — medido: `innerText` — regla
   «Poco texto a la vista» (Felipe 2026-11-13: como mucho una línea de 8 palabras; lo que explica va detrás del «?») — regla del repo sin prueba — va a `/textos`.
   Propuesta: dejar «Nacen solas en Insumos y en Por pagar.» y pasar el resto al «?» de la cabecera.

## Leves
1. **«Faltan 18.00 m» en la fila de tela ya no lleva una acción al lado.** La acción vive en la tarjeta de «Para decidir» («Comprar la tela» → `/produccion/insumos`),
   dos bloques más arriba. — `ResumenProduccionPanel.tsx`, rama `t.estado === "falta"` — medido: a ojo en 1440 y 375 — [Práctica] «una lista dice qué
   hacer» — va a `/formidable` si Felipe quiere el enlace también en la fila.

## Previos al PR (no se tocaron)
1. Las filas de Facturas de insumos (`button.grid.w-full … outline-none vd-pasa`, `ComprobantesProduccionPanel.tsx:203`) no tienen anillo de foco. Con el teclado,
   la fila solo cambia de fondo (`.vd-pasa:focus-visible`, `vidrio/rellenos.css:58`). `medir.js { foco: true }`: 3 de 11 controles «sin anillo». WCAG 2.4.7
   se cumple con el cambio de fondo; el anillo de ADR-0351 no. Ya estaba en main.
2. `span.titulo-seccion-dato` a 13 px en tres subtítulos del Resumen: es la pieza decidida `TituloSeccion`, en el piso de la escala (ADR-0691).
3. `div.vacio-chico` con 14 px de relleno lateral y `p.aviso-linea-tit` con 1 px de margen: valores fuera de la escala de 4, dentro de piezas decididas.
4. Animaciones de entrada del Resumen de más de 500 ms: `cayla-trazo-dibuja` de 520–900 ms y `cayla-sube` de 850 ms. Las dos terminan a los 1350 ms, ninguna queda
   en bucle y en «quieto» no corre ninguna. Van a `/movimiento` para confirmar si están en la lista de ADR-0136.

## Decidido a propósito
- Los 2 `:hover` que el medidor lista (`.barra-t:hover`, `.parecidas-punto:hover::after`) son de otras pantallas cargadas en la hoja de estilos y no se ven aquí.
- La cabecera de Facturas de insumos queda **sin acción** a propósito (Felipe 2026-11-25): las facturas nacen en Insumos y en Por pagar.
- El vacío de Facturas lleva «Ir a Insumos» como acción principal: ir a otra pantalla es el paso que sigue (`unificar-fijo`, ronda 5).

## Sin medir
- `/produccion/insumos` y «Llegó una compra»: el PR solo quitó el aviso de pedido abierto y la prop `pedidos`, sin agregar nada visible. Dibujarlo pide el estante
  completo (`datos.materiales`, lotes, fichas). Queda a `/formidable` con base.
- La vista de tela de una orden (`orden-pagina/TelaDeLaOrdenVista`): el PR quitó el botón «Pedir {faltan}» de la fila. Dibujarla pide un `OrdenPagina`
  completo. Revisado en el código: el `<Chip>` de «Faltan / Alcanza» sigue en el mismo contenedor `flex flex-wrap gap-x-2`, sin hueco ni pieza nueva.
- Foco con teclado del Resumen: no se corrió `{ foco: true }`, porque el PR no agregó controles ahí, solo quitó dos enlaces.
- Con una base y una cuenta de verdad: nada. Todo se midió con datos inventados, sin sesión.

## Corregido después de la auditoría (2026-11-26)
- Media 1: el «¿Por qué?» y el subtítulo de «¿Alcanza la tela?» ya no hablan de pedidos ni de «en camino»: dicen «facturado por recibir».
- Media 2: el texto del vacío de Facturas de insumos baja a una línea («Se crean al registrar una compra en Insumos.» o «Primero agrega al proveedor.»).
