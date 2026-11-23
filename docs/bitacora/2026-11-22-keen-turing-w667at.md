# 2026-11-22/23 · Barrido del piso (ADR-0690)

- **Qué:** Inventario ▸ Existencias ▸ «Barrido del piso»: varias personas escanean lo colgado desde su celular (con quién y a qué hora),
  apartan lo que no se puede escanear con foto, quitan lo repetido sin borrar y, al confirmar, el sistema corrige piso y almacén en los dos
  sentidos con traslados internos (el total no cambia). Aviso del barrido del mes en Existencias. La actividad 8, «Por resolver», está hecha y dormida
  hasta pegar `20261122195000`.
- **Revisión adversarial** (16 revisores, cada hallazgo reproducido en local): una apartada colgada y escaneada se movía de más, Lima con
  dos dueños trababa el confirmar, la pantalla quedaba frenada tras confirmar, eliminar y fusionar productos no conocían las tablas nuevas,
  y lo escaneado mientras se revisaba entraba sin verse. Todo corregido en `20261122194500` y en la web, con su prueba.
- **Producción:** `190000`–`193000` pegadas por Felipe el 2026-11-22; `194000` y `194500` pegadas por Felipe el 2026-11-23, comprobadas leyendo producción, antes de publicar la web. `195000` queda POR PEGAR.
- **2026-11-23 · Publicado y actividad 8 encendida.** #1975 fusionado y publicado en retail.cayla.pe; Felipe pegó `194000`, `194500` y
  `195000` («Por resolver»), comprobadas leyendo producción.
- **Actividad 9 · Historial de barridos** (`/inventario/barrido/historial`): la lista de la sede y el detalle de cada barrido (quién y entre
  qué horas, lo movido, lo no cargado, cada lectura para solo leer). Revisión adversarial: «Por resolver» del historial no descontaba lo ya
  resuelto, el catálogo era el de la sede activa y no la del barrido; corregido con su prueba. Migración `20261122196000`, por pegar.
- **Actividad 10 · Cierre** (2026-11-23):
  - Probado con `/formidable`, una prueba a ciegas a 375 px y `/chaos` (≈ 60 ataques, ningún estado imposible).
  - En el celular, el campo y la última prenda quedan en la primera pantalla.
  - Las repetidas preguntan también tras recargar: salen de la base.
  - En «Lo escaneado», lo tuyo sale primero.
  - Textos de tienda.
  - Lo que llegó tarde tras confirmar se nombra.
  - Detalle en ADR-0690, «Actualización 2026-11-23».

