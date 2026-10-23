## 🏷️ Reimprimir al guardar una campaña, tienda por tienda (2026-10-23) — solo web, sin migración; rama `claude/vigilant-visvesvaraya-88f3ff`

- [x] `prendasQueCambianDePrecioHoy` compara el descuento de hoy en cada tienda (`rigeEnSede`, la regla de `fn_campana_rige_en_sede`) y dice en cuáles cambia y qué se imprime desde la sede de la cabecera; `avisoReimprimir` nombra las tiendas (Felipe: «Nombrar tiendas»).
- [x] `CampanaModal` recibe `sedeActualId` desde Catálogo ▸ Insignias y Tienda web ▸ Campañas.
- [x] Pruebas: solo cambian las tiendas, se suma una tienda, sin tiendas = todas, otro % de una campaña limitada, cambio distinto en cada tienda, sin tiendas conocidas.
- [x] Visto en el navegador en local (de todas a solo Trujillo desde Lima, con botón; de vuelta desde Trujillo, sin botón).
- [ ] «Prendas» (`prendasQueCambianAlEtiquetar`) y Editar producto (`cambianEnCaja`) no miran las tiendas: con una campaña limitada, su aviso puede ofrecer imprimir donde el precio no cambió.
- [ ] Idea descartada por ahora (pide una tabla): que cada tienda afectada vea en su Inicio «Reimprime las etiquetas de …» hasta imprimirlas.
- [ ] Sin probar a 375 px (Insignias es de escritorio).
