# Spike visual · Punto de venta más amigable y mejor distribuido (2026-09-28)

> **Estado: en revisión con Felipe.** Sin aplicar. No toca `PuntoDeVenta.tsx`,
> `PuntoDeVentaCatalogo.tsx` ni `PuntoDeVentaTicket.tsx`: es HTML/CSS/JS autocontenido
> con datos inventados, para decidir qué se construye antes de construirlo.

`punto-venta-amigable.html`: un solo archivo, ábrelo en el navegador. La barra negra de
arriba no existe en el ERP; alterna **Escritorio / Celular** y **Hoy (publicado) /
Propuesta**.

## De dónde sale

Felipe pidió una vuelta visual "mucho más intuitiva, amigable y mejor distribuida" del
Punto de venta, sin capturas puntuales esta vez. Antes de dibujar nada, se leyó el
código real de `PuntoDeVenta.tsx` / `PuntoDeVentaCatalogo.tsx` / `PuntoDeVentaTicket.tsx`
contra `origin/main` (`59dad776`, 2026-09-28) — no el spike `punto-venta-ticket-alto-2026-09`,
que ya había quedado desactualizado frente a lo publicado.

Ese código, hoy, ya es sólido: accesos por rol, «Apartar»/«Más» (ADR-0221), el ticket a
lo alto, «apartada para una clienta» distinta de «agotada», tallas «solo en almacén»
con aviso, cámara en celular, «Más» como grilla de íconos. Este spike **no reabre nada
de eso** — es una pasada de calidez y distribución sobre una pantalla que ya funciona
bien, no un rediseño de información.

## Los 7 cambios de la propuesta

1. **Cabecera con pausa.** «Sede · Apartar · Más» se agrupa aparte de «Hoy», con una
   regla vertical y más aire — hoy flota todo en una sola fila sin jerarquía.
2. **Categorías con pista de continuidad.** Un desvanecido CSS (`mask-image`) en el
   borde derecho de la fila de chips avisa que hay más para el lado — hoy corta en
   seco sin ninguna señal. Verificado con más categorías de las que caben hoy
   (Faldas, Shorts, Accesorios) para que el desvanecido tenga algo que mostrar.
3. **El ticket como superficie propia.** Toda la columna del ticket pasa a `papel`,
   separada del `crema` del catálogo — hoy los dos tonos casi se confunden y cuesta
   ver de un vistazo dónde termina el catálogo y empieza la venta.
4. **Miniatura por línea.** Cada prenda del ticket suma su foto (o iniciales, igual
   que la tarjeta del catálogo) — hoy es solo texto, y con 3-4 prendas cuesta ubicar
   cuál es cuál sin leer.
5. **Costura de recibo.** Una línea punteada separa «lo que se lleva» del bloque de
   cobro, como la perforación de un recibo real — una metáfora que cualquier
   colaboradora ya conoce, sin inventar un ícono nuevo.
6. **Ticket vacío con un ícono.** Una bolsa de trazo sobre «El ticket está vacío» —
   hoy es puro texto, frío para lo primero que ve cualquiera al abrir caja.
7. **Pulso al agregar.** Al tocar una talla, la miniatura late una vez, corto y sin
   rebote (300 ms, `ease-cayla`) — respuesta a la acción, no decoración (lo permite
   ADR-0136: "sin rebote, nunca decorativo, nunca en bucle"). Demo real en el spike:
   toca cualquier talla con stock en la vista Escritorio/Propuesta.

## Lo que NO cambia, a propósito

- **Accesos por rol, «Apartar»/«Más», el ticket a lo alto** (ADR-0221): ya decidido,
  ya publicado, ya verificado con Felipe. Tocarlo de nuevo sería reabrir una decisión
  cerrada sin una razón nueva.
- **Los colores de los chips de categoría** (fondo `tinta` cuando están prendidos):
  es el mismo componente que usa el resto del ERP (`chip()`, comentario del propio
  código: "mismo radio que la pastilla del selector de ubicación"). Cambiarlo solo
  en Vender rompería la consistencia entre pantallas — si se quiere más cálido, es
  una decisión de sistema de diseño completo, no de este módulo.
- **La tarjeta del catálogo** (foto, nombre, color, tallas, precio, stock): ya
  resuelve bien "apartada" vs "agotada" vs "solo en almacén" con tooltips y color
  informativo (`pizarra`/`ambar-profundo`). No se tocó nada de su estructura.
- **Los tokens de color** (ADR-0169): ni uno nuevo. Todo lo de arriba sale de
  `crema`/`papel`/`sand`/`hueso`/`tinta`/`pizarra`/`ambar-profundo` ya existentes.

## Qué pide cada cambio

| Cambio | Solo CSS/HTML | Toca lógica |
|---|---|---|
| 1. Cabecera con pausa | ✓ | |
| 2. Categorías con desvanecido | ✓ | |
| 3. Ticket como superficie propia | ✓ | |
| 4. Miniatura por línea | | usa `varianteId`/foto que el carrito ya trae — solo hay que pintarla |
| 5. Costura de recibo | ✓ | |
| 6. Ticket vacío con ícono | ✓ | |
| 7. Pulso al agregar | | un `className` temporal en la tarjeta al agregar — sin estado nuevo de negocio |

Los siete son baratos: ninguno pide una tabla, una RPC ni una migración. El más grande
(#4, miniatura por línea) reutiliza la misma foto/iniciales que ya calcula
`PuntoDeVentaCatalogo.tsx` (`iniciales()`, `g.fotoUrl`) — no hay dato nuevo que traer.

## Decisión pendiente de Felipe

- ¿Los siete cambios juntos, o solo algunos? Ninguno depende de los otros — se pueden
  aprobar por separado.
- El ticket a fondo `papel` (#3) sube levemente el contraste de todo el bloque:
  vale la pena mirarlo en escritorio Y celular antes de aprobar (la hoja del celular
  ya es una superficie elevada por el modal — ahí el cambio se nota menos).
