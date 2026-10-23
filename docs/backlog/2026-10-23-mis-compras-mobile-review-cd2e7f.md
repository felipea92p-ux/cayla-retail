## Mis compras en el celular: lo que quedó de la revisión (rama `claude/mis-compras-mobile-review-cd2e7f`, ADR-0480)

**No está en producción:** `20261023225000_mis_compras_rondas_cerradas.sql` (solo lectura: `fn_ronda_compras_de` suma `cerradas`). Se pega tal cual en el SQL Editor; hasta entonces el historial agrupa por ronda pero no muestra «Devolviste en caja».

Pendiente (no se tocó: es diseño o negocio, decide Felipe):
- [ ] **«Compré ropa», paso 2, en un celular real:** la cabecera de la pantalla, el paso, la pregunta y los filtros por categoría (que se parten en 3 filas) dejan a la vista solo el borde de la primera fila de prendas. Ideas: filtros en una sola fila que se desliza de lado, o sin la frase de la cabecera desde el paso 2.
- [ ] **La lista de proveedores** muestra también proveedores de gastos (Claro, Entel) para comprar ropa. ¿Se filtran por rubro?
- [ ] **El «atrás» del celular dentro de «Compré ropa»** hoy pregunta si salir; lo natural sería volver al paso anterior. Los pasos no cambian la dirección.
- [ ] **«Antes de abrir tu ronda 0 · Todavía no anotas nada aquí»** cuando todo está en rondas anteriores: ¿se esconde ese bloque vacío?
- [ ] **La foto se sube tal como sale de la cámara** (2–5 MB): con datos móviles lentos «Subiendo la foto…» puede tardar. Comprimirla en el celular antes de subirla.
- [ ] **Por confirmar fuera de Mis compras:** en `next dev` (con el `node_modules` del checkout principal, Next 16.2), tras **recargar** la página (también /compras) el contenido no se hidrata hasta el primer toque, y ese toque se pierde. No se vio al entrar navegando. Confirmarlo con `next build` + `next start` antes de tratarlo como bug.
