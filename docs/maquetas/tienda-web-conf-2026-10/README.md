# Tienda web ▸ Conf. Tienda: maqueta (2026-10-26)

Prototipo tocable (`index.html`, sin base ni código real) de cómo quedaría `/tienda-web/ajustes` con lo que le falta. **La maqueta no cambia el ERP por sí sola;
el 2026-10-26 se construyó en `apps/web` (ADR-0518, migración `20261026162000`, sin pegar en producción).** Solo usa los tokens de `globals.css` y `tema.css` (claro y oscuro).

## Lo que ya existe y se conserva
Nombre en la web, WhatsApp, dónde recoger, horario, «Visible en la web», la regla de qué falta (nombre, WhatsApp, dónde), la vista
previa en vivo, el responsable, los plazos (confirmar, pagar, recoger) y desde cuándo se ve la cifra de stock.

## Lo que se suma (botón «Resaltar lo nuevo» lo marca)
- **Mapa:** se pega el enlace de Google Maps y la web activa «Cómo llegar».
- **Foto:** la fachada de la tienda, que se suelta o se elige.
- **Horario por días:** cada día es una barra con dos asas visibles. Se arrastra un borde para cambiar esa hora, la barra para moverla
  entera, un hueco para pintar una nueva, y un día cerrado se abre con un toque. De a media hora. Una línea roja marca la hora de ahora.
- **Cierres:** «Cerrar hoy» y «Otra fecha» (feriados, inventario). La web dice «Cerrada hoy».
- **Stock en la web:** una escala 1, 2, 3 y «4+ siempre Hay»: arriba lo que queda, abajo lo que lee el cliente.
- **Orden:** las tiendas se arrastran para ordenar cómo salen en la web.

## Datos
Real: los tres nombres de sede. **Inventado:** direcciones, teléfonos, horarios, enlaces y la hora de prueba.

## Lo que pidió la base (construido el 2026-10-26)
`ubicacion_datos_web` ya tiene nombre, dirección, horario (texto) y visible. Faltarían: enlace de mapa, foto, horario por días,
cierres por fecha y posición. Una migración nueva; dinero, stock y permisos no se tocan. Lo que se apartó de la maqueta al construir: los cierres no llevan motivo
(«Feriado»), y la escala de stock dice «Quedan 2» como la tarjeta de la prenda.
