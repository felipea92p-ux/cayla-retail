# 2026-11-01 · Maquetas del vidrio: el sistema que habla (ADR-0596)

- **Reparto:** las piezas «Por auditar» del tablero se repartieron entre dos sesiones. Esta hace avisos de la esquina, loader y versión nueva, y
  después acciones chicas y el selector de mes. La otra (rama `claude/maquetas-vidrio-pendientes-213be4`) hace vacío y paginación, casilla y
  enlaces, gráficos, avatares, la barra y el cajón del celular, e íconos.
- **Avisos de la esquina, loader y «Hay una versión nueva»:** maqueta `docs/maquetas/avisos-espera-vidrio-2026-10/`, sobre Proveedores. En los
  avisos: «Como ahora», A · Placa Serena, B · Lente del tono (recomendada) y C · Isla ahumada. En el loader: «Como ahora», A · Hoja Serena
  (recomendada) y B · Lente sola. En la versión nueva: «Como ahora», A · Gota ahumada (recomendada) y B · Gota de vidrio claro. Se copió la
  coreografía real de `avisos.css`, y la gota sin cambios: solo cambia el material. Con la cabecera «Dos islas», la píldora baja bajo la
  cabecera, porque el buscador ocupa la banda donde hoy se centra. Se capturó en claro y oscuro, a 1440 y 375 px, sin errores. Sin cambios en `apps/web`.
- **Lo que eligió Felipe:** avisos B · Lente del tono, loader B · Lente sola y versión nueva A · Gota ahumada. En el loader no tomó la
  recomendada (la hoja Serena). Como las palabras del loader van sueltas, se les puso detrás un halo de crema sin borde, para que se lean
  aunque detrás pase algo oscuro; se miró en claro a 1440 px y en oscuro a 375 px.
- **Acciones chicas y selector de mes:** maqueta `docs/maquetas/acciones-mes-vidrio-2026-11/`, sobre Ventas ▸ Comprobantes ▸ Emitidos. Los
  botones con palabra (copiar, descargar, imprimir, editar, ver) ya son la gota elegida y no llevan caras. Las caras: íconos de fila (A · Gota
  al pasar, recomendada; B · Gota siempre), menú «Más» (A · La lista del combo, recomendada; B · Placa con hundido) y selector de mes
  (A · Gota en su pozo, recomendada, como la paginación; B · Gota entera). Medida de 320 a 1920 px sin desbordes, en claro y oscuro, sin
  errores. Sin cambios en `apps/web`.
- **Lo que eligió Felipe en las acciones chicas y el mes:** íconos de fila A · Gota al pasar, menú «Más» A · La lista del combo y selector
  de mes B · Gota entera. Primero dijo «B, A y B» y después mandó su selección de la barra con los íconos en A; quedó la última. En el mes no
  tomó la recomendada.
- **Íconos del marco y del contenido** (la otra sesión me los pasó; ella hace el cajón del celular): maqueta `docs/maquetas/iconos-vidrio-2026-11/`,
  sobre Configuración ▸ «Cómo cobra la sede». En el marco: A · Se llena al elegir (recomendada) y B · Duotono siempre. En el contenido:
  «Como ahora» (recomendada), A · Duotono en los de 20 y B · Lente para los de 20. Los de 12, 14 y 16 px no cambian en ninguna cara. Medida
  de 320 a 1920 px sin desbordes, en claro y oscuro, sin errores. Sin cambios en `apps/web`.
- **Lo que eligió Felipe en los íconos:** marco A · Se llena al elegir y contenido A · Duotono en los de 20 (en el contenido no tomó la
  recomendada).
- **Caja, página entera** (la otra sesión me la pasó; ella hace Punto de Venta y Existencias): maqueta `docs/maquetas/caja-vidrio-2026-11/`,
  en la vista «hoy contra ayer», armada solo con las piezas elegidas. Caras de lo propio: el titular (A · Ahumado, recomendada; B · Placa
  clara; C · Al aire) y la barra de cierre (A · Placa que se tiñe, recomendada; B · Isla), con sus tres niveles por la hora; «Cerrar caja» pasa
  a la gota roja. Fuera, la persiana de «Caja cerrada». Medida de 320 a 1920 px sin desbordes, en claro y oscuro, sin errores. Sin cambios en
  `apps/web`.
- **Lo que eligió Felipe en Caja (2026-11-02):** titular A · Ahumado y barra de cierre B · Isla (en la barra no tomó la recomendada). La isla
  pierde la bajada de cada nivel: queda anotado en el README para quien implemente.
- **Historial de ventas, página entera (2026-11-02)** (me la pasó la otra sesión): maqueta `docs/maquetas/historial-ventas-vidrio-2026-11/`,
  armada solo con las piezas elegidas (también el separador de día B · Gotas que flotan). Caras de lo propio: la línea del tiempo
  (A · Hilo de vidrio, recomendada; B · Solo los días en gota) y la pila de prendas (A · Lentes apiladas, recomendada; B · Bandeja). Medida
  de 320 a 1920 px sin desbordes, en claro y oscuro, sin errores. Sin cambios en `apps/web`.
- **Lo que eligió Felipe en Historial (2026-11-02):** línea del tiempo B · Solo los días en gota (no tomó la recomendada) y pila de prendas
  A · Lentes apiladas. Lo mandó con el botón «Copiar mi selección», mirando en claro.
- **Traslados, página entera (2026-11-02)** (me la pasó la otra sesión): es la billetera de pases (ADR-0355), un diseño propio. Le pregunté a
  Felipe y decidió pasarla al vidrio con el mismo movimiento. Maqueta `docs/maquetas/traslados-vidrio-2026-11/`. Caras de lo propio: el pase
  (A · Vidrio claro, recomendada, con los huecos de la perforación recortados de verdad con una máscara; B · Lente del tono) y el escenario
  (A · Al aire, recomendada; B · Pozo). Medida de 320 a 1920 px sin desbordes, en claro y oscuro, sin errores. Sin cambios en `apps/web`.
- **Lo que eligió Felipe en Traslados (2026-11-02):** el pase B · Lente del tono (no tomó la recomendada) y el escenario A · Al aire.
- **Cambios y Devoluciones, páginas enteras (2026-11-02)** (me las pasó la otra sesión): una sola maqueta, `docs/maquetas/posventa-vidrio-2026-11/`,
  armada solo con lo elegido (también la tarjeta de prenda B · Foto al aire de Vender y la isla con «Cobrar» que se invierte en oscuro).
  Caras de lo propio: el paso a paso (A · Hilo de vidrio, recomendada; B · Pozo con gota) y lo que trae y lo que lleva (A · Balanza,
  recomendada; B · Talón). Medida a 375 px en los dos temas, en las dos pantallas y los tres momentos (PL-105), con tres capturas en la carpeta.
  También de 320 a 1920 px sin desbordes y sin errores. Sin cambios en `apps/web`.
- **Apartados, página entera (2026-11-02)** (me la pasó la otra sesión): maqueta `docs/maquetas/apartados-vidrio-2026-11/`, con las tres
  vistas (Todos, Entregar y Apartar), armada solo con lo elegido; la prenda va en su miniatura de hoy porque la tarjeta de Productos sigue
  sin elegirse. Caras de lo propio: la hoja (A · Al aire, recomendada; B · Placa) y las pestañas del celular (A · Isla de pestañas,
  recomendada; B · Franja de vidrio). En la maqueta, `marco.css` ya usa `.hoja` y `.cifras`, así que aquí se llaman `.ap-hoja` y
  `.ap-cifras`. Medida a 375 px (PL-105) con dos capturas, y de 320 a 1920 px sin desbordes ni errores. Sin cambios en `apps/web`.
- **Mis compras, página entera (2026-11-02)** (me la pasó la otra sesión): maqueta `docs/maquetas/mis-compras-vidrio-2026-11/`, armada solo
  con lo elegido. Caras de lo propio: la billetera (A · Ahumada, recomendada, la misma decisión que el titular de Caja; B · Placa clara) y
  «¿Qué hiciste?» (A · Gota grande, recomendada; B · Tarjetas de opción). Medida de 320 a 1920 px, en claro y oscuro, sin desbordes ni
  errores. Sin cambios en `apps/web`.
- **Conteo, página entera (2026-11-02)** (me la pasó la otra sesión): maqueta `docs/maquetas/conteo-vidrio-2026-11/`, con el inicio y la
  pantalla de contar. La planilla conserva su cara de tabla, como pide ADR-0358, y solo cambia el material: A · Placa Serena (recomendada)
  o B · Lámina casi papel. Los pasos: A · Ranura con gotas (recomendada) o B · Pozo con gota; es la misma pieza que el paso a paso de
  Posventa y de Recibir. Medida de 320 a 1920 px sin desbordes ni errores. Sin cambios en `apps/web`.
