# 2026-10-26 · El logo oficial en todo el papel y en el login

- **Qué:** etiqueta de precio y de liquidación, ticket térmico (venta, cambio y apartado), boleta y proforma A4, guía de traslado, cartel y
  páginas del Club, vista previa de campaña, loader y login usan `LogoCayla` (el logo oficial del lateral, ADR-0446) en vez del colibrí viejo
  y «CAYLA» escrito con letra espaciada. `LogoCayla` ganó `tinta` (`marca` · `negro` para la térmica · `actual`). El sello del cartel pasó
  de «CLUB CAYLA» a «CLUB» (la palabra ya está en el logo). Se borró `IsotipoCayla` (sin uso).
- **Papel:** la boleta y la proforma A4 tienen 22 mm de margen arriba (antes 12: el logo salía pegado al borde). El ticket térmico termina
  en 24 mm de blanco con un punto impreso al final (antes 18 mm de padding): el driver recortaba el blanco del final, el papel se quedaba
  sobre el pie y había que apretar «avanzar papel» para arrancarlo.
- **Queda:** el colibrí que vuela en el login (`lib/login-vuelo.ts`, `EntradaColibri`) sigue con los trazos del colibrí viejo: rehacer el vuelo
  con el oficial es otra obra de animación.
- **Cómo se verifica:** `/etiquetas-de-precio?producto=<id>` muestra el logo en negro arriba de cada etiqueta; `/clientas/cartel`, el logo
  en crema. Ticket, boleta y guía se miraron con una página temporal y las reglas de impresión aplicadas en pantalla.
