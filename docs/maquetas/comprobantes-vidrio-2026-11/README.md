# Maqueta · Ventas ▸ Comprobantes con vidrio (2026-11-02)

Una página entera de la sección 3 del tablero `docs/vidrio/README.md` (ADR-0596): Ventas ▸ Comprobantes (`app/(app)/vender/comprobantes` →
`FacturacionShell`, `FacturacionCabecera`, `ComprobantesTarjetas`, `ComprobantesPanel`; ADR-0124).

**Solo el material.** Nada de SUNAT ni de Lucode cambia: qué se envía y cuándo, los estados, el motivo de un rechazo, anular, liberar,
reenviar, la cola y su aviso.

Abrir `index.html` (o con la config `maquetas` del navegador integrado). La barra negra elige la cara de lo propio, el tema y el ancho (de 320
a 1920 px). Pasa el mouse por una tarjeta de arriba: la luz la sigue, como hoy.

Está armada **solo con lo ya elegido**: cabecera A (con la línea viva y la insignia ámbar del sandbox), el aviso B · Lente del tono, pestañas A
con su globito, buscador A · Pozo, filtros A · Gotas («Hoy / Este mes» y los de la lista), tabla B · Placa Serena, insignia A, el «⋯» de una fila,
la barra apilada y las barras por tiempo con los gráficos B · Tinta sobre vidrio, la isla de pestañas del celular y botones gota.

Esta pantalla tenía **su propio vidrio** desde ADR-0124 (`.tema-vidrio`, `.vidrio-cayla`, `.pestanas-vidrio`, `.kpi-vidrio` en
`app/globals.css`): con el vidrio de todo el ERP, esa isla se va.

## Lo propio de Comprobantes (con caras)

| Pieza | Cara | Cómo es |
|---|---|---|
| Las tarjetas de indicador (`TarjetaKpiVidrio`) | Como ahora | El vidrio de ADR-0124: papel translúcido con borde arena, el canto de 3 px del estado, su tinte que se difumina y la luz que sigue al mouse. |
| | **A · Lente del tono** (elegida) | La placa Serena; la que tiene un estado que decir (pendientes, rechazados) se tiñe apenas de él con su filo; el ícono en su gota. La luz se queda. |
| | B · Placa con su canto | La placa Serena para todas; el canto, una gota fina del estado dentro de la placa. |
| Los documentos de SUNAT y el vínculo (`DocumentosSunat`, «Tiene NC…») | Como ahora | Cuatro enlaces subrayados; el vínculo, un rectángulo pizarra. |
| | **A · Gotas chicas** (elegida) | «Ver PDF» y «WhatsApp» en gotas claras de 26 px; XML y CDR, enlaces tenues; el vínculo, una lente pizarra. |
| | B · Ranura | Los cuatro juntos en una ranura fina. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`. En el celular los documentos siguen viviendo en el «⋯», como hoy.

## Lo que no cambia

Nada de SUNAT ni de Lucode. Tampoco la línea viva, la insignia del sandbox, lo que dice cada tarjeta y su gráfico (sin rojo en los gráficos),
las columnas de la lista, los botones de cada estado, el «⋯» de cada fila ni los totales del pie.

## Reglas que respeta

Solo tokens. Claro y oscuro. Sin movimiento nuevo (la luz que sigue al mouse ya existía); todo se apaga con `prefers-reduced-motion`. Datos
inventados. Medida de 320 a 1920 px sin que nada se salga.

## Lo que decidió Felipe

**2026-11-02: las recomendadas, las tarjetas A · Lente del tono y los documentos A · Gotas chicas.** Al implementar (solo el material; nada
de SUNAT ni de Lucode):
- Se va la isla de ADR-0124 en `app/globals.css`: `.tema-vidrio`, `.vidrio-cayla`, `.pestanas-vidrio` (las pestañas pasan a `<Pestanas>`, la
  gota elegida) y el material de `.kpi-vidrio`.
- `TarjetaKpiVidrio`: la placa Serena (vidrio 64→44 %, desenfoque 24 y saturación 1,6, su luz arriba). Sin el canto de 3 px ni el tinte que se
  difumina: con `tono` ámbar, rojo o verde, la placa se tiñe del tono al 6→12 % sobre vidrio con un filo del tono al 30 % (en oscuro, 14→8 %
  sobre transparente); con `taupe`, placa clara. El ícono, en una gota de 32 px del tono al 14 %. La luz que sigue al mouse (`--mx`, `--my`),
  el subir 2 px al pasar y el `@property --kc` que desliza el color se quedan. Los gráficos no cambian (sin rojo).
- `DocumentosSunat`: «Ver PDF» y «WhatsApp», gotas claras de 26 px con su ícono de 13 px (`borde`, vidrio 90→55 %); «XML» y «CDR», enlaces
  tenues de 11,5 px tras un punto. «Tiene …» / «Corrige …» (`bg-pizarra/[0.08]`), una lente pizarra (6→13 % sobre vidrio, filo al 28 %, píldora).
  En el celular siguen en el «⋯».
