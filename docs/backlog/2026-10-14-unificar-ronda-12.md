## 🧩 /unificar, pendientes antes de la ronda 12: la cabecera de todo el ERP, «Etiquetas», «Ver», Nueva compra y contrastes (2026-10-14, ADR-0358) — solo web, sin migración; rama `claude/unificar-ronda-12`

- [x] **Nueva compra a 1440 px:** la plantilla de la fila reparte el ancho entre producto y talla; «Sin desglose (se reparte al recibir)» se lee «Sin desglose» con el combo cerrado (`Opcion.corto`).
- [x] **Contrastes heredados del claro:** 91 textos al 55-60 % de tinta a 70 % (Compras, Por pagar, Categorías, Configuración, el buscador de la cabecera, el atajo «/», el segmento inactivo); la fila `fin-suave` de Finanzas atenúa su texto, no la opacidad. `tema:auditar`: 0 en claro y oscuro en esas pantallas y en Cuentas y Gastos.
- [x] **La cabecera de todo el ERP** (Felipe eligió P1 mirando fotos): `EncabezadoPagina` en 31 pantallas; `CabeceraPantalla` solo en Finanzas. Decisión `titulo-pagina` con firmas (`<h1>` en la serif a mano, `CabeceraPantalla` fuera de Finanzas), deuda 0. La pieza gana frase opcional; el sobretítulo va en `detalle`.
- [x] **«Etiquetas» con la etiqueta** en Productos (tabla y vista rápida), como en Existencias; salen dos excepciones de `accion.imprimir`.
- [x] **El «Ver» de los pendientes de Caja** es el enlace del sistema; firma nueva en `accion.ver`.
- [x] Verificado en el ERP local a 1440 px en claro y oscuro y a 375 px (fotos en `docs/unificar/capturas/titulo-pagina.*.jpg`); huellas de 8 guías aceptadas tras revisar su texto; la guía del Resumen de Producción explica los botones antes que las pestañas.
- [ ] **Familias y Editar producto sin mirar en local:** a la base local le falta `familias.entra_a_motores` (ADR-0377). Mirarlas cuando Felipe actualice la base.
- [ ] **El «Ver» de Caja sin mirar en local:** la tarjeta de pendientes no salía con la caja de la base local (171 h abierta). El cambio es la clase `btn-enlace`, la misma de la demo que eligió Felipe.
- [ ] **El escáner de las guías no conoce las piezas de las rondas 10 y 11** (`BotonVer`, `BotonDescargar`, `BotonImprimir`, `BotonLimpiar`, `FiltroPuesto`): un control migrado a ellas sale de la huella. Sumarlas a `CONTROLES` en `apps/web/guias/escaner.mjs` y re-aceptar las huellas que cambien.
- [ ] **Cotizaciones de maquila** no tiene cabecera de pantalla (es una tarjeta con su título de sección): decidir si lleva `EncabezadoPagina`.
- [ ] **Avisar a Dany:** Rendimiento cambió de cabecera (solo cómo se ve).
- [ ] **La frase de Eficiencia del Taller** ocupa cuatro líneas bajo el título de 46 px: si Felipe la quiere más corta, es una decisión de texto.
