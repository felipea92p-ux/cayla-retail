# 2026-11-02 — Tienda web con vidrio

- **Qué:** Resumen, Pedidos, Vitrina, Campañas, Recomendaciones, Tráfico y Conf. Tienda pasan del papel al vidrio con las piezas ya elegidas, sin maqueta (`docs/vidrio/README.md`, 4.3). Vive en `apps/web/app/estilos/vidrio/tienda-web.css`; el layout del grupo pone `.tienda-web-vidrio`, y en las hojas las cajas pasan a `card-cayla`. Solo cambia el material. De paso: el conteo de una pestaña elegida que «pide» algo no se leía en todo el ERP (crema sobre la gota clara, 1,09:1) y el pie pegado del editor de campaña se salía 8 px a 375 px; quedaron arreglados.
- **Verificado:** `tema:auditar` con 0 hallazgos solo en oscuro en las rutas reales y en vistas temporales con datos inventados (no se commitean); sin desborde a 1440 y 375 px; combo y opciones probados en el navegador; tipos, Vitest completo y Knip en verde.
- **Falta:** verlo con pedidos, campañas y tráfico reales; las hojas de Vitrina y Looks no se abrieron con datos; `/formidable` no se corrió. Siguen en 4.3: Producción, Clientes, Gestión ▸ Análisis, Configuración y Administración.

# 2026-11-02 — Configuración con vidrio

- **Qué:** las 8 pestañas de Configuración pasan al vidrio con una sola pieza, `apps/web/app/estilos/vidrio/pantalla-en-vidrio.css`: el layout pone `.pantalla-en-vidrio` y sus bloques, campos, combos y tablas (kit de Finanzas) toman la placa Serena, el pozo y el hilo. Tienda web usa ahora la misma pieza; Finanzas sigue en papel (El telar). Solo cambia el material.
- **Verificado:** `tema:auditar` en las 8 pestañas con 0 hallazgos solo en oscuro (los 2 heredados son los botones ahumados, que el auditor lee mal por el degradado); sin desborde a 1440 y 375 px; un combo abre su lista fuera de la placa, sin recortarse. Aprendido: un `@import` nuevo en `globals.css` no entra con el servidor corriendo ni reiniciándolo: hay que borrar `.next` (la caché de Turbopack).
- **Falta:** los campos y combos del kit dentro de las hojas de Configuración (siguen en hueso) y `/formidable`. No se guardó ningún dato ni se abrió una hoja.

# 2026-11-02 — Configuración a todo el ancho y /formidable

- **Qué:** `/configuracion` sale de `CON_TOPE_DE_ANCHO`; WhatsApp y «Pregúntale a CAYLA» van lado a lado desde 1280 px y la pestaña pasa a «Reparto CLAURE» para que las 8 quepan. `/formidable` (informe en `docs/formidable/configuracion.md`): textos más claros (qué mide «Mínimo de caja», por qué existe el único «Guardar», qué meta manda) y errores en lenguaje de tienda. Ninguna regla cambia.
- **Verificado:** capturas a 1920, 1440, 1280 y 375 sin desborde; `tema:auditar` de la pantalla final en «Tiendas y caja» (las demás pestañas, antes de los últimos textos); `guias:recorrer` de la guía, 39 pasos sin escribir; tipos, Vitest y Knip.
- **Falta:** el error de lectura no se provocó en el navegador y la ciega no se repitió tras los textos; colaboradora real sin probar. Lo que Felipe decide (partir «Tiendas y caja», la guía de foco) queda en la lista aparte del informe.

# 2026-11-03 — Compras con vidrio

- **Qué:** todo el grupo de Compras pasa al vidrio con `.pantalla-en-vidrio` en su layout. La pieza compartida se corrigió porque pisaba estados, también en Tienda web y Configuración: ahora respeta la tarjeta de cifra que filtra, la tarjeta elegida, el filo de color, el borde de botones y enlaces y el fondo de tono; además pasa a la placa los bloques en papel o arena. El encabezado de `<Tabla>` pierde la arena a cualquier hondura, en todo el ERP (Órdenes lo anidaba).
- **Verificado:** `tema:auditar` en 15 rutas con 0 hallazgos solo en oscuro (los heredados son degradados que el auditor lee mal: ninguno sin imagen); sin desborde de página a 375 y 1024 px en 15 rutas; comparación elemento por elemento con y sin la pieza en Plan, Mis compras y Proveedores; capturas en claro y oscuro con datos de un banco local solo leído.
- **Falta:** el banco llega a migraciones del 2026-10-24 y no tiene rendiciones ni fechas de campaña en curso, así que Quién tiene plata y Pendientes de campaña no se vieron con datos; la tarjeta elegida y el filo se comprobaron poniendo la clase en el navegador, no recorriendo el Apunte hasta ese paso. Las hojas no cambian (se cuelgan fuera del grupo). Felipe decide el botón verde «Pagado». Siguen en 4.3: Producción, Clientes, Gestión ▸ Análisis, Administración y Salud del negocio.

# 2026-11-03 — Historial de compras con menos texto

- **Qué:** Felipe pidió texto preciso en las tres pestañas. Se acortan las cifras, los vacíos y la nota de Revisar; una factura anulada dice «Anulada» una sola vez y una pagada solo lleva su chip; los destinos van sin «Tienda»; «Concentración» pasa a «Mayor deuda». Se quita el recuadro «Días promedio de pago», que nunca mostraba un dato. Ninguna cifra ni regla cambia.
- **Verificado:** capturas de las tres pestañas en claro y oscuro a 1440 px y en claro a 375 px, sin desborde; tipos, Vitest completo y Knip.
- **Falta:** no se tocaron las hojas ni el detalle de una factura; persona real sin probar.
