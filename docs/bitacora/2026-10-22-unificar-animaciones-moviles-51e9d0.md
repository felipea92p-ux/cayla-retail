## 2026-10-22 (La hoja del celular se porta como una hoja: llega desde el borde, se baja con el dedo y aleja lo de atrás)
Qué hice: auditoría del teléfono (98 escenarios a 375 px: 0 de 61 hojas con asa o arrastre, 29 sin ✕, 8 barras de abajo distintas),
maqueta tocable con tres formas, Felipe eligió «B · Hoja viva con profundidad» y quedó en `<Modal>` y `<Cajon>` (ADR-0479, actividades
1 a 6 de 12): asa, arrastre con «¿Salir sin guardar?», el ticket de Vender que no se cierra mientras cobra, lo de atrás que se aleja,
Filtros a media altura y el cajón como hoja alta que se desliza entre registros; registrada en `/unificar` con su prueba.
Por qué así: dos piezas le llegan a las 197 hojas y los 10 cajones sin tocar pantallas, y las reglas del dedo quedaron puras y probadas.
Felipe se lleva: probarlo en su iPhone desde la vista previa del PR; quedan las actividades 7 a 12 (toques pegados, aviso, márgenes del
iPhone, capas a mano, menú lateral, una sola barra de abajo).

## 2026-10-23 (Tanda 2: nada pegado al tocar, el aviso con el dedo, los bordes del iPhone, las capas a mano, el menú que se desliza)
Qué hice: actividades 7 a 11 de ADR-0479, una por commit: 210 `:hover` bajo `@media (hover: hover)` con su candado, el aviso con ✕ a la
vista y que se aparta con el dedo, `viewport-fit=cover` con todo el marco apartado de la isla, la muesca y la barrita, Proveedor y las
píldoras de fechas como hoja del sistema (`CapaDeFiltro`, deuda de `hoja-movil` en 0) y el menú lateral que se cierra deslizándolo.
Por qué así: cada arreglo vive en la pieza del sistema (el CSS, `Avisos`, `AppShell`, `Modal`), así ninguna pantalla tuvo que hacer nada.
Felipe se lleva: la lámina de la actividad 12 para elegir la barra de abajo; Caja se desborda a 375 px (anotado, no es de esta rama).

## 2026-10-23 (La barra de abajo del celular es una sola: la Isla)
Qué hice: Felipe eligió mirando la Isla para las dos preguntas; la construí (`barra-abajo`, `<BarraDeAbajo>`), la registré en `/unificar`
(`barra-movil`) y llevé las 14 barras a mano a la pieza en cuatro commits, con fotos a 375 y 1440 px.
Por qué así: la pieza es solo la forma, así cada pantalla conservó sus botones y lo que hacen, y en escritorio nada cambió.
Felipe se lleva: probar la isla en su iPhone (Vender, Existencias, Por pagar, Nuevo producto); Caja a 375 px sigue desbordada (tarjeta aparte).

