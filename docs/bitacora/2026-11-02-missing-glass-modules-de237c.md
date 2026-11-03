# 2026-11-02 — Tienda web con vidrio

- **Qué:** Resumen, Pedidos, Vitrina, Campañas, Recomendaciones, Tráfico y Conf. Tienda pasan del papel al vidrio con las piezas ya elegidas, sin maqueta (`docs/vidrio/README.md`, 4.3). Vive en `apps/web/app/estilos/vidrio/tienda-web.css`; el layout del grupo pone `.tienda-web-vidrio`, y en las hojas las cajas pasan a `card-cayla`. Solo cambia el material. De paso: el conteo de una pestaña elegida que «pide» algo no se leía en todo el ERP (crema sobre la gota clara, 1,09:1) y el pie pegado del editor de campaña se salía 8 px a 375 px; quedaron arreglados.
- **Verificado:** `tema:auditar` con 0 hallazgos solo en oscuro en las rutas reales y en vistas temporales con datos inventados (no se commitean); sin desborde a 1440 y 375 px; combo y opciones probados en el navegador; tipos, Vitest completo y Knip en verde.
- **Falta:** verlo con pedidos, campañas y tráfico reales; las hojas de Vitrina y Looks no se abrieron con datos; `/formidable` no se corrió. Siguen en 4.3: Producción, Clientes, Gestión ▸ Análisis, Configuración y Administración.

# 2026-11-02 — Configuración con vidrio

- **Qué:** las 8 pestañas de Configuración pasan al vidrio con una sola pieza, `apps/web/app/estilos/vidrio/pantalla-en-vidrio.css`: el layout pone `.pantalla-en-vidrio` y sus bloques, campos, combos y tablas (kit de Finanzas) toman la placa Serena, el pozo y el hilo. Tienda web usa ahora la misma pieza; Finanzas sigue en papel (El telar). Solo cambia el material.
- **Verificado:** `tema:auditar` en las 8 pestañas con 0 hallazgos solo en oscuro (los 2 heredados son los botones ahumados, que el auditor lee mal por el degradado); sin desborde a 1440 y 375 px; un combo abre su lista fuera de la placa, sin recortarse. Aprendido: un `@import` nuevo en `globals.css` no entra con el servidor corriendo ni reiniciándolo: hay que borrar `.next` (la caché de Turbopack).
- **Falta:** los campos y combos del kit dentro de las hojas de Configuración (siguen en hueso) y `/formidable`. No se guardó ningún dato ni se abrió una hoja.
