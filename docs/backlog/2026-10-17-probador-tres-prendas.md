## El armador acepta máximo 3 prendas (ADR-0444)

- [x] `zonaDelProbador` (compartida por la tienda y el ERP): arriba (con casacas, blazers, chalecos y abrigos), abajo y bolso; fuera vestidos, enterizos, conjuntos y capas.
  `tsc`, `knip`, las pruebas de la web (556) y de la tienda (530) en verde.
- [ ] **Verlo en pantalla** (no se pudo aquí): `/looks/arma` con una cuenta —que una casaca reemplace al polo, que no salgan «Algo encima» ni «o un vestido»— y Vitrina ▸ Probador.
- [ ] **Largo de las faldas:** vaciar el típico de «Faldas» (55 cm) en Vitrina ▸ Probador ▸ Largos típicos y medir el largo propio de las que tienen recorte; «Falda Jean» sale
  ancha por usar 55 cm. Ancho en el probador = largo × proporción del recorte.
- [ ] Contar cuántas prendas salen (vestidos, conjuntos, capas) y cuántas entran (casacas, blazers, chalecos, abrigos) con la lista viva de Vitrina ▸ Probador.
- [ ] Quitar del motor de la tienda el código de las zonas «vestido» y «encima» (queda sin uso): otro cambio, con 40 pruebas.
