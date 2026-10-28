// La deuda de `knip --production` (`scripts/knip/produccion.mjs`, ADR-0406 actualización del 2026-10-14): lo que el 2026-10-14
// ya usaban solo sus pruebas. Cada línea es una pieza de la web que ninguna pantalla importa, con la fecha en que perdió su
// último uso en `main` (y el PR) o «nunca» si no tuvo pantalla. Qué hacer con cada una y por qué está aquí:
// `docs/investigacion/2026-10-14-codigo-que-solo-usan-las-pruebas.md`.
//
// SOLO BAJA. Se sale de la lista conectando la pieza a su pantalla o borrándola con su prueba (y con las que solo ella usaba en
// su archivo: Knip las muestra en la corrida siguiente). Nunca se agrega una línea: una pieza nueva sin pantalla se conecta, se
// borra o, si existe para su prueba, se declara con `@internal` y su motivo.
export const DEUDA = [
  // Las usó una pantalla y la pantalla cambió (51).
  "apps/web/lib/intento-reglas.ts: cobrosPorResolver", // 2026-10-14 · #1068
  "apps/web/lib/produccion-decisiones.ts: decisionesDeProduccion", // 2026-10-14 · 555fedd7b
  "apps/web/lib/recibidas-filtros-reglas.ts: textoProveedor", // 2026-10-13 · #1026
  "apps/web/lib/plan-compra-reglas.ts: campanasActivas", // 2026-10-12 · #977
  "apps/web/lib/frescura-pantalla.ts: tramoBarraDe", // 2026-10-10 · bd5b3c6f7
  "apps/web/lib/frescura-reglas.ts: tramoDe", // 2026-10-10 · bd5b3c6f7
  "apps/web/lib/marcas.ts: filtrarMarcas", // 2026-10-10 · #930
  "apps/web/lib/marcas.ts: textoProductosMarca", // 2026-10-10 · #930
  "apps/web/lib/existencias-prendas.ts: aclaracionDeLaCaja", // 2026-10-07 · #873
  "apps/web/lib/existencias-prendas.ts: desgloseDePrenda", // 2026-10-07 · #873
  "apps/web/lib/existencias-prendas.ts: lineaDeLaSuma", // 2026-10-07 · #873
  "apps/web/lib/por-regularizar-reglas.ts: siguienteOrden", // 2026-10-07 · #867
  "apps/web/lib/movimientos-reglas.ts: unidades", // 2026-10-06 · #858
  "apps/web/lib/recordatorio-cierre-reglas.ts: progreso", // 2026-10-06 · #856
  "apps/web/lib/reponer-prenda-reglas.ts: topeDeTalla", // 2026-10-06 · #833
  "apps/web/lib/retiro-reglas.ts: TEXTOS_BLOQUE_SUBIR", // 2026-10-06 · #833
  "apps/web/lib/traslados-reglas.ts: textoLlegada", // 2026-10-06 · #841
  "apps/web/lib/colaboradores-reglas.ts: fechaHoraLima", // 2026-10-05 · #816
  "apps/web/lib/se-probo-reglas.ts: OPCIONES_RAZON", // 2026-10-02 · #727
  "apps/web/lib/club-reglas.ts: textoVigente", // 2026-10-01 · #697
  "apps/web/lib/alta-producto.ts: codigosRepetidos", // 2026-09-29 · 0d4c44599
  "apps/web/lib/movimientos-atajos.ts: atajosDeMovimiento", // 2026-09-29 · #589
  "apps/web/lib/movimientos-atajos.ts: atajosDeOperacion", // 2026-09-29 · #589
  "apps/web/lib/marcas.ts: marcaAutomatica", // 2026-09-28 · #578
  "apps/web/lib/marcas.ts: proveedorAutomatico", // 2026-09-28 · #578
  "apps/web/lib/caja-panel-reglas.ts: escalaTurno", // 2026-09-26 · #489
  "apps/web/lib/alta-producto.ts: desbloqueos", // 2026-09-25 · #395
  "apps/web/lib/marcas.ts: buscarMarcaProveedor", // 2026-09-25 · #395
  "apps/web/lib/facturacion-actividad.ts: accionDeLaFila", // 2026-09-22 · #287
  "apps/web/lib/facturacion-actividad.ts: camposDeBusquedaDeLaFila", // 2026-09-22 · #287
  "apps/web/lib/facturacion-actividad.ts: detalleDeLaFila", // 2026-09-22 · #287
  "apps/web/lib/facturacion-actividad.ts: enlazarVentasConComprobantes", // 2026-09-22 · #287
  "apps/web/lib/facturacion-actividad.ts: estadoDeLaFila", // 2026-09-22 · #287
  "apps/web/lib/facturacion-actividad.ts: etapasDelHilo", // 2026-09-22 · #287
  "apps/web/lib/facturacion-comprobantes-reglas.ts: seriesFaltantes", // 2026-09-22 · #287
  "apps/web/lib/facturacion-comprobantes-reglas.ts: textoDeSeriesFaltantes", // 2026-09-22 · #287
  "apps/web/lib/facturacion-proformas-reglas.ts: franjaDeProformas", // 2026-09-22 · #287
  "apps/web/lib/facturacion-resumen-reglas.ts: comparativoEnCantidad", // 2026-09-22 · #287
  "apps/web/lib/facturacion-resumen-reglas.ts: comparativoEnPorcentaje", // 2026-09-22 · #287
  "apps/web/lib/facturacion-resumen-reglas.ts: horaDeReloj", // 2026-09-22 · #287
  "apps/web/lib/facturacion-resumen-reglas.ts: tonoPorEnviar", // 2026-09-22 · #287
  "apps/web/lib/facturacion-resumen-reglas.ts: tonoVendidoHoy", // 2026-09-22 · #287
  "apps/web/lib/facturacion-resumen-reglas.ts: ventasUnicas", // 2026-09-22 · #287
  "apps/web/lib/produccion-menu.ts: hijosMenuCompras", // 2026-09-21 · 518132fbe
  "apps/web/lib/produccion-menu.ts: hijosMenuProduccion", // 2026-09-21 · 518132fbe
  "apps/web/lib/produccion-menu.ts: puedeVerCompras", // 2026-09-21 · 518132fbe
  "apps/web/lib/recepciones-reglas.ts: resumenConteo", // 2026-09-19 · #172
  "apps/web/lib/panel-serie.ts: hastaEstaHora", // 2026-09-12 · 0af2f1b54
  "apps/web/lib/panel-serie.ts: INDICE_SEMANA_PASADA", // 2026-09-12 · 0af2f1b54
  "apps/web/lib/panel-serie.ts: indiceEnSerie", // 2026-09-12 · 0af2f1b54
  "apps/web/lib/panel-serie.ts: inicioDeLaVentana", // 2026-09-12 · 0af2f1b54
  // Nunca tuvieron pantalla en main (17).
  "apps/web/lib/plan-piso-familias.ts: textoDeRepartoParaLector", // nunca · nació 2026-10-12 · 3b1fafcc3
  "apps/web/lib/frescura-piso.ts: conteoDeFamilia", // nunca · nació 2026-10-10 · bd5b3c6f7
  "apps/web/lib/motor-demanda-reglas.ts: faltasDe", // nunca · nació 2026-10-05 · #823
  "apps/web/lib/movimientos-tipos.ts: grupoDeTipo", // nunca · nació 2026-10-05 · #822
  "apps/web/lib/productos-filtro-precio.ts: montoParaUrl", // nunca · nació 2026-10-02 · #723
  "apps/web/lib/productos-orden.ts: ordenPorVentas", // nunca · nació 2026-09-29 · 781f66bcf
  "apps/web/lib/alta-producto.ts: pasoAlcanzable", // nunca · nació 2026-09-25 · #395
  "apps/web/lib/por-pagar-consolidado-reglas.ts: ordenarPorVencimiento", // nunca · nació 2026-09-25 · #396
  "apps/web/lib/presupuesto-reglas.ts: filasQueSePasan", // nunca · nació 2026-09-25 · #396
  "apps/web/lib/configuracion-reglas.ts: textoEfecto", // nunca · nació 2026-09-24 · #390
  "apps/web/lib/reparto-reglas.ts: textoTeToca", // nunca · nació 2026-09-19 · #203
  "apps/web/lib/caja-panel-reglas.ts: egresosElevados", // nunca · nació 2026-09-18 · #128
  "apps/web/lib/caja-panel-reglas.ts: rangoHorasCaja", // nunca · nació 2026-09-18 · #128
  "apps/web/lib/caja-panel-reglas.ts: senalCaja", // nunca · nació 2026-09-18 · #128
  "apps/web/lib/caja-panel-reglas.ts: tendenciaCierres7Dias", // nunca · nació 2026-09-18 · #128
  "apps/web/lib/caja-panel-reglas.ts: ventasPorHora", // nunca · nació 2026-09-18 · #128
  // Aparte, cada una con su decisión (9): registro-contable.ts (mover IGV_TASA y borrar el resto), la hoja de prueba de
  // etiquetas, la copia de scripts/terminales/reglas.mjs, el retiro de «Mis partes de compras» y un alias.
  "apps/web/lib/clienta-ticket-reglas.ts: dniEnmascarado", // 2026-10-01 · #673 (alias de numeroEnmascarado)
  "apps/web/lib/codigo128.ts", // 2026-10-06 · #858 (solo scripts/etiquetas/hoja-de-prueba.mjs)
  "apps/web/lib/compras-mi-parte-reglas.ts: partesPorPagar", // 2026-10-13 · #1034 (con «Mis partes», ADR-0387)
  "apps/web/lib/qr.ts: puntosPorModuloQR", // nunca (solo scripts/etiquetas/hoja-de-prueba.mjs)
  "apps/web/lib/registro-contable.ts: construirLineas", // 2026-09-12 · 0af2f1b54
  "apps/web/lib/registro-contable.ts: opcionesPrincipal", // 2026-09-12 · 0af2f1b54
  "apps/web/lib/registro-contable.ts: sumaDebe", // 2026-09-12 · 0af2f1b54
  "apps/web/lib/registro-contable.ts: sumaHaber", // 2026-09-12 · 0af2f1b54
  "apps/web/lib/terminales-reglas.ts: resolverTienda", // nunca (scripts/terminales/reglas.mjs tiene su copia)
];
