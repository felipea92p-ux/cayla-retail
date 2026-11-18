## Responsive de celular y tablet (`/multi-view-responsive celular`, 2026-11-18)

- [x] Modo `celular` en `/multi-view-responsive`: seis tamaños de teléfono y tablet y un segundo medidor (toque de 44 px, zoom de campos, pegado que no pega, fijo atrapado, barras pegadas).
- [x] Primera corrida, `vender celular` (parcial; el servidor local corría la rama `claude/campanas-simple`, 56 commits detrás de `main`). Medido: Vender (entrada, catálogo abierto, ticket con una prenda, hoja de cobro), Apartados e Historial (solo su entrada). Sin desbordes ni hojas cortadas en teléfono.

### Lo que encontró esa corrida

- [x] **Toque chico en el ticket de Vender** (celular obligatorio): el «%» de descuento de cada línea mide 94 × 27 px (`components/punto-de-venta/LineaDelTicket.tsx:123`). A 360, 375 y 430.
- [x] **Toque chico en Apartados** (celular obligatorio): «Opciones» mide 110 × 36 px (`components/apartados/ApartadosPanel.tsx:130`, `h-9`). A 360, 375 y 430.
- [ ] **Cobro con el teléfono acostado** (844 × 390): el resumen y «Confirmar cobro» quedan fijos y a los pasos les queda una franja de unos 80 px; los medios de pago se ven a medias. Visto en captura, medido como mouse.
- [x] **Toque chico en Historial:** el chip «Pendiente de enviar» de una venta mide 151 × 26 px (`components/HistorialVentasLista.tsx`). A 360, 375 y 430.
- [x] **Toque chico en la cabecera** (toda pantalla, desde 401 px de ancho): el colibrí que lleva al Inicio mide 39 × 26 px (`components/AppShell.tsx:1221`).
- [ ] Menores: «Volver al ticket» de la hoja de cobro mide 42 × 42; «Dejar en espera» a 360 px queda en un ícono de 38 px de ancho; en Historial la última píldora de período se corta en seco contra «Filtros» y sus áreas se pisan (360 y 430).

- [ ] Los cuatro toques de arriba se arreglaron sumando `area-dedo` a cada control (el colibrí además se dibuja de 44 px). Falta **verlos con el código de esta rama corriendo**: el «después» se comprobó aplicando la misma clase en vivo sobre el servidor local, que corría otra rama.

### Pendiente del modo celular

- [ ] Repetir `vender celular` con el panel del navegador a la vista y sobre `main`, y completar lo no cubierto: los modales de Vender (Prenda sin registrar, Más, Separé una dañada, cliente, descuento, cupón), Apartados por dentro (Entregar, Historial, Opciones, apartar una prenda), el detalle de Historial, y Reportes y Comprobantes (8 rutas).
- [ ] Seguir módulo por módulo: `/cambios` y `/devoluciones` primero (celular obligatorio).
- [ ] **Felipe decide:** con el menú lateral abierto, un teléfono acostado (844 × 390) deja 557 px de ancho y 390 de alto para la pantalla. ¿Bajo cierto alto el menú debería plegarse solo? (Plegado, el problema baja mucho.)
- [ ] Dos `100vh` sin respaldo en `dvh`: `apps/web/app/estilos/finanzas-dinero.css:846` (el alto máximo de un panel pegado) y `apps/web/app/global-error.tsx:62`. Riesgo bajo; el de `login.css` ya trae su respaldo.
- [ ] La tablet de verdad es táctil, pero el navegador integrado solo emula el dedo bajo 768 px: el toque de 44 px a 768 y 820 no se mide. Para medirlo haría falta sumarle esos anchos a `apps/web/tacto/medir.mjs` (Playwright sí emula el dedo a cualquier ancho).
- [ ] `apps/web/tacto/medir.mjs` recorre `/vender` sin prendas en el ticket: por eso no vio el «%» de la línea. Sumarle el ticket con una prenda.
