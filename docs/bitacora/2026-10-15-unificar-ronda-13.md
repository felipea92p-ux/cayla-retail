## 2026-10-15 (/unificar: ronda 13 — la barra de avance, el anillo, copiar y el menú «Más», decididos y migrados)
Qué hice: el censo de gráficos, íconos y los botones que quedaban se cortó por disco (la caché de Turbopack llegó a 19 GB); lo repetí dirigido
a los 11 módulos donde viven, y para los gráficos tracé el código con un agente (el motor no distingue una barra de avance ni un anillo
chico): unos 120 gráficos en cuatro tipos. Separé de `grafico` dos familias propias, `grafico.avance` y `grafico.anillo`, y armé una página de
elegir con cuatro preguntas y demos vivas (barras y anillos que se mueven con «−/+», copiar que copia, el menú que se abre). Felipe eligió las
cuatro P1. Construí `<BarraAvance>` (reemplaza también a la homónima del detalle de un comprobante), `<Anillo>`, `<BotonCopiar>` y el «⋯» de
32 px de `<MenuAcciones>` con `<BotonPuntos>`, y migré unas 40 barras en 27 archivos, 9 anillos, 12 «copiar» y 3 menús. Deuda 0 en las
cuatro, con firmas probadas contra el código de antes.
Por qué así: «una función, una pieza» (ADR-0358). La barra y el anillo no deciden qué es malo: tinta mientras avanza, verde al completarse, y
el rojo o el ámbar los pone la pantalla; una medida que no es un avance (días de stock, módulos de un rol, el margen) se queda en tinta.
Migrar no cambió qué hace nada: lo que cada pantalla avisaba al copiar se conserva (`alCopiar`), y el camino viejo de copiar de la nota de
crédito ahora lo tienen todas.
Felipe se lleva: una sola barra de avance, un solo anillo, un solo copiar y un solo «Más» en todo el ERP (menos el Observatorio, Análisis,
Finanzas y los pases de Traslados, por su ADR), y las fotos de propuesta y después en `docs/unificar/capturas/` (`grafico.avance.*`,
`grafico.anillo.*`, `accion.copiar.*`, `accion.menu.*`).
