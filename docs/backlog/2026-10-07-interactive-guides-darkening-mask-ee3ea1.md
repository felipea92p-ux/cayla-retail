## 🎬 Guías interactivas con máscara (2026-10-07, ADR-0362) — web + 1 migración (en producción desde el 2026-10-07); rama `claude/interactive-guides-darkening-mask-ee3ea1`

- [x] Motor con velo y recorte (`components/guias/GuiaInteractiva.tsx`), piloto que nunca guarda (`piloto.ts`, `lib/guias/reglas.ts` con prueba), tokens y modo oscuro, `prefers-reduced-motion`.
- [x] Oferta una vez por persona y pantalla (`MotorGuias`, `retail.guias_vistas`, respaldo en el navegador) y «Demo» en Mi perfil (selector por módulo y submódulo; lo sin guía dice «Pronto»).
- [x] Guías de Punto de Venta, Apartados, Historial y Comprobantes; recorridas con `guias:recorrer` en escritorio claro y a 375 px en oscuro, sin escrituras.
- [x] Candado del CI por controles (`lib/guias.test.ts`, `guias/escaner.mjs`, `lib/guias/huellas/`), skill `/guia`, regla en CLAUDE.md, casilla del PR.
- [x] **Producción:** `20261007180000_guias_vistas.sql` pegada el 2026-10-07 por orden de Felipe y registrada con su versión; RLS sin políticas, funciones `security definer`, `anon` sin acceso (comprobado).
- [x] **Terminales:** «Demo» en la cabecera, en el lugar de «Actividad» (Felipe 2026-10-07); verificado con la terminal de ventas de Lima a 1440 y 375 px.
- [x] **Todo el ERP** (Felipe 2026-10-07, OK expreso): 79 guías, 12 no-aplica, `PENDIENTES_HOY = 0` (ADR-0362 act. e).
- [ ] **Recorrer con datos** lo que la base local no puede mostrar (⚠ del recorredor): Revisar y Confirmar conteo y la cara «contar»; Compras ▸ Mi parte; Producción con órdenes, insumos y facturas; Inicio de Almacén; Pedidos no atendidos; Análisis con prendas.
- [ ] Movimiento rico (ADR-0362 act. d) aprobado de palabra: que Felipe lo mire en la tienda y diga si es demasiado.
- [ ] Probar con 3 a 5 colaboradoras reales en la tienda (que la demo se entienda sin explicación, ADR-0350).
- [x] Ofertas solo en las entradas del menú; «Demo ▸ Esta pantalla» para las internas (Felipe 2026-10-09).
- [ ] **Tras fusionar, en la tienda:** abrir un conteo real y repetir las demos de Revisar y Confirmar conteo; Mi parte de la factura con una compra repartida; Producción con datos; Inicio de Almacén (Felipe 2026-10-09).
- [ ] Refrescar el diccionario de datos con `retail.guias_vistas` (`datos:generar:produccion` tras refrescar el volcado).
