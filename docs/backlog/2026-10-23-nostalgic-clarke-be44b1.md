## 🏷️ Reimprimir tienda por tienda también en «Prendas» y Editar producto (2026-10-23) — solo web, sin migración; rama `claude/nostalgic-clarke-be44b1`

- [x] `cambioEnLasTiendas` (`lib/etiqueta-campana.ts`): la regla «tienda por tienda → qué dice el aviso» de la hoja «Configurar», ahora en una pieza que usan las tres pantallas.
- [x] «Prendas»: `prendasQueCambianAlEtiquetar` devuelve un `CambioDePrecio`; `PrendasDeEtiquetaModal` recibe `tiendas` y `sedeActualId` desde Insignias y Tienda web ▸ Campañas.
- [x] Editar producto: `cambianEnCajaAlGuardar` (`lib/precio-de-hoy.ts`) compara el precio en caja en cada tienda, con las campañas que rigen en ella y su precio propio (ADR-0370); la página lee `campanas_sedes()`.
- [x] Pruebas: campaña de solo Trujillo marcada desde Lima (sin botón, nombra Trujillo) y desde Trujillo (botón); precio propio en Trujillo al cambiar el precio de la prenda.
- [x] Visto en el navegador en local («Prendas» y Editar producto, desde Lima y desde Trujillo); la campaña y las marcas de la prueba se devolvieron como estaban.
- [ ] La frase «la caja cobra…» de Editar producto (`fraseDeLaFicha`) y el «Antes de aplicar» de «Prendas» (`vistaPrevia`) todavía no saben de tiendas: en Lima dicen el descuento de una campaña de solo Trujillo. Felipe decide qué tienda miran.
- [ ] Sin probar a 375 px (Insignias y Editar producto son de escritorio).
