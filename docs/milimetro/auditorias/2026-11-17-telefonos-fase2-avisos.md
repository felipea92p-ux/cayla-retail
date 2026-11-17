# Auditoría al milímetro — `/compras/mi-plata/compra` y `/vender`, lo que cambia la Fase 2 de ADR-0674 · 2026-11-17 · `claude/confident-gauss-continue-f86c75` · `eee0fa952`

Medido: 1440×900 claro · 375×812 claro · 1440 oscuro (y 375 oscuro en el aviso de Vender) · quieto y vivo     Servidor: `http://localhost:3010` (Playwright; el panel integrado estaba oculto)
Resumen: **0 graves · 0 medias · 3 leves heredadas de piezas del sistema · 0 decididos a propósito**

Alcance: solo lo que esta rama agrega a la vista. No hay piezas nuevas: son avisos del sistema (`avisar.aviso` / `avisar.error`,
`components/ui/Avisos.tsx`) y un `<Aviso tono="atencion" accion>` (`components/ui/Aviso.tsx`), con textos nuevos; y un cambio de movimiento.

| Pieza | Dónde | Qué se midió |
|---|---|---|
| A · aviso «Seguimos con la compra que estabas anotando» + «Empezar de nuevo» | `RegistrarCompra.tsx`, al recuperar | estados, color (claro 375 y 1440, oscuro 1440), letra, textos, espacio |
| B · `<Aviso>` «Esta compra ya estaba guardada» + enlace «Ver Mis compras» | paso «Papel y pago», tras `compra_rapida_otros_datos` (respuesta simulada: la base no se tocó) | estados, foco con teclado, color (claro y oscuro a 1440), letra, textos, espacio |
| D · aviso «No se pudo abrir «Cerrar caja»» | `HojaBajoDemanda.tsx`, sin red al abrir | estados, color (375 claro y oscuro), letra, textos |
| E · el ticket de Vender al agregar una prenda | `useFlipDelTicket.ts` | movimiento quieto y vivo a 1440 |

## Graves
Ninguno.

## Medias
Ninguna.

## Leves (las tres son de la pieza del sistema, no de esta rama; valen para todo aviso del ERP)
1. El título de un aviso flotante va a 14/18,9 px = 1,35 de interlineado — `p.aviso-tit` — medido en A, que ocupa dos renglones a 375 y a 1440 (la tarjeta mide 343–352 px) — regla: 1,4 o más en texto de lectura de dos renglones — [Práctica] — va a /tipografia.
2. El detalle de un aviso flotante va a 13 px — `p.aviso-det` — medido en D — regla del repo: la letra de lectura no baja de 14 px (ADR-0358, ronda 19) — el medidor lo cuenta como marco — va a /tipografia.
3. El enlace de un `<Aviso accion>` lleva 7 px de relleno arriba y abajo (fuera de la escala de 4) — `.aviso-linea-acc a` — medido en B; el enlace mide 122 × 31 px (pasa los 24 px con mouse) — [Práctica] — va a /espacio.

## Lo que pasó
- **Contraste** [Norma, WCAG 1.4.3 y 1.4.11]: 0 textos y 0 controles por debajo del umbral en A (375 y 1440 claro; 1440 oscuro), B (1440 claro y oscuro) y D (375 claro y oscuro). Presupuesto de rojo: 0 piezas.
- **Foco** [Norma, WCAG 2.4.7]: «Ver Mis compras» con teclado: `:focus-visible`, contorno sólido de 2 px en tinta, separación 2 px (`--foco-*`, ADR-0351).
- **Lo que se anuncia**: A y B son `role="status"`; D (error) es `role="alert"`.
- **Textos** [regla del repo «Poco texto»]: sin fallas medibles en las tres piezas. Título y una línea: «Seguimos con la compra que estabas anotando» / «CAYLA · 3 prendas.»; «Esta compra ya estaba guardada» / «Se guardó antes, con otros datos.»; «No se pudo abrir «Cerrar caja»» / «Revisa la conexión y vuelve a intentarlo.». Al revisar B a 375 px se le quitó una segunda frase que el enlace ya decía.
- **Ancho**: las tres piezas caben a 375 px sin desborde (A y D: 343 px de 375; B: 328 px).
- **Movimiento** [regla del repo, ADR-0625]: quieto, agregar una prenda al ticket da 0 animaciones y 0 cambios de estilo en línea (antes de esta rama GSAP animaba el ticket también quieto). Vivo: 1 pieza animada por JavaScript (el reflujo del ticket, 320 ms, `caylaEase`), como antes.

## Sin medir
- El contraste de B a 375 px: el medidor dio todos los textos de esa vista por tapados; queda medido a 1440 en los dos temas (mismos tokens) y visto en captura a 375.
- El área de toque con el dedo (`pointer: coarse`, 44 px) de «Empezar de nuevo» (130 × 33 px con mouse) y de «Ver Mis compras»: el navegador de la prueba tenía puntero fino. Queda para el teléfono real.
- El foco del botón «Empezar de nuevo» del aviso flotante (dura 7 s) y el aviso «La compra que estabas anotando ya se guardó» (misma pieza que A; exige una compra guardada en la base).
- El loader mientras baja una hoja bajo demanda (en local baja en milisegundos y no llega a verse).

## Añadido el mismo día — el corte de Caja
Las cuatro hojas de Caja que pasan a bajar bajo demanda usan la pieza D ya medida arriba (el mismo aviso de error, con otro nombre de hoja):
«No se pudo abrir «Cerrar caja»», «… el historial de cierres», «… el detalle de la venta», «… «Registrar gasto»», todas con «Revisa la
conexión y vuelve a intentarlo.». No hay pieza, color ni medida nueva; las hojas se ven igual que antes. Visto en Caja a 1366 px (el aviso
del historial sin red) y a 375 px («Cerrar caja» desde la barra de abajo, sin desborde). No se volvieron a correr los medidores.
