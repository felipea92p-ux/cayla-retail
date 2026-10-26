# Filtros detrás del botón «Filtros», en un panel flotante (Felipe, 2026-10-26)

**Pedido:** en Tienda web ▸ Vitrina ▸ Modelos, «esos filtros pueden estar dentro de un ícono de filtro y que sea flotante», junto al buscador y a la
izquierda de «Vitrina / Lista», y que esos controles pasen a íconos en una pantalla chica para ganar espacio.

**Pieza:** `components/ui/FiltrosFlotantes.tsx`: el botón de siempre (`BotonFiltros`, con el número de filtros puestos en su globito; bajo `sm`, solo
el ícono con un punto) y, al tocarlo, un panel que flota bajo el botón (`lista-flotante`, portal, sin empujar la lista). Adentro van las píldoras de
siempre (`DesplegablePildora`); tocar una lista de adentro no cierra el panel, y se cierra con un toque afuera o con Escape. Lo puesto queda debajo
del buscador como `FiltroPuesto` con «Limpiar filtros». El segmento «Vitrina / Lista» gana `soloIcono` (opción de `SegmentoDeslizante`).

**Alcance:** solo la Vitrina. Las demás pantallas siguen con su panel en línea (`BotonFiltros` + `PanelPildoras`); extenderlo a ellas es decisión de
Felipe, mirando. Un panel que flota no empuja lo de abajo (la lista no salta al abrirlo) a costa de tapar un poco la lista mientras está abierto.
