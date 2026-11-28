## ⚡ Hojas que no congelan Safari (2026-11-27, ADR-0715) — solo web, sin migración; rama `claude/hojas-rapidas-safari`

### Hecho

- [x] Causa medida en WebKit (el motor de Safari) con un build de producción: el `Dialog.Overlay` de Radix agrega y quita una hoja de estilos
  al abrir y cerrar; Safari rehace con eso las 6.316 reglas del ERP. Descartados la base, la red (salvo una vuelta de más), el vidrio que
  dobla y la guía de foco.
- [x] `<VeloDeHoja>` en `<Modal>` y `<Cajon>`, con el candado en `<html>` (`lib/candado-de-scroll.ts`) y su prueba; vigilante
  `lib/hojas-velo.test.ts`.
- [x] «Llegó una compra» pide las cuentas con el Taller que trae la pantalla (una vuelta menos a la base).
- [x] Probado en WebKit y Chrome: bloqueo, velo y Escape cierran, foco atrapado, posición de la página, cajón con velo, 375 px con gesto
  táctil real y la hoja «Más» de Vender a 375 px.

### Sin hacer (dicho sin adornos)

- [ ] **No se probó en Safari mismo ni en un iPhone real:** WebKit de Playwright es el mismo motor, pero no el mismo programa. Abrir y cerrar
  una hoja en el Safari de Felipe (Insumos ▸ «Llegó una compra») es la prueba final.
- [ ] **Decide Felipe:** el `pointer-events: none` que Radix pone en el `<body>` mientras hay una hoja cuesta ~30 ms más al abrir en Safari
  (~60 ms en una pantalla larga). Neutralizarlo cambiaría qué se puede tocar por encima del velo (avisos, menús, la isla del celular).
- [ ] **Trabajo grande, aparte:** el CSS del ERP (6.316 reglas, 1,6 MB, 437 `@keyframes`, 498 variables en `<html>`) es lo que encarece todo en
  Safari: cada cambio que toca la página entera cuesta 30 a 150 ms. Achicarlo es de muchos módulos y de Dynamic.
- [ ] La primera apertura de una hoja después de entrar a una pantalla sigue en ~0,2 s en Safari (el motor todavía no conoce su código).
- [ ] `PagarComprobanteProduccionModal` y `PagarServicioModal` también preguntan el Taller con `useIdDelTaller`: revisar si su pantalla ya lo
  sabe, como «Llegó una compra».

### Para Dynamic

- `components/ui/VeloDeHoja.tsx` (pieza nueva), `lib/candado-de-scroll.ts`, y `<Modal>` y `<Cajon>` sin `Dialog.Overlay`. Cambia cómo funcionan,
  no cómo se ven: allá hay que hacer el mismo cambio a mano.
