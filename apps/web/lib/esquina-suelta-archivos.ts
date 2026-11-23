// Los archivos que todavía escriben una esquina a mano (`rounded-[9px]`, `border-radius: 9px`, `borderRadius: 9`) en vez de pedirla a la
// escala, y cuántas veces (ADR-0698; Felipe 2026-11-19: «cuatro radios, y concéntricas»). Lo lee `lib/esquina-suelta.test.ts`, que falla
// si aparece una esquina suelta en un archivo que no está aquí o si un archivo de la lista tiene MÁS.
//
// La escala vive en el `@theme` de `app/globals.css`: 6 `rounded-sm` · 10 `rounded-md` · 14 `rounded-campo` · 22 `rounded-tarjeta`
// (en una hoja de estilos, `var(--radius-sm)`…); lo que flota trae la suya (cajón 28, hoja 32). Dos clases de entrada:
//
//   · PERMANENTE (`ESQUINA_FIJA`, con su motivo): el archivo entero no dibuja piezas de la interfaz (un objeto físico, un papel). Una sola
//     línea legítima no viene aquí: lleva `esquina-fija: <por qué>` en un comentario de la misma línea.
//   · DEUDA (`ESQUINA_A_MANO`, con su cuenta): lo que quedó al cerrar la escala el 2026-11-23. Casi todo es de piezas con diseño propio que
//     Felipe eligió mirando (Estados financieros, los pases de Traslados, el Observatorio, Análisis, Rendimiento, El telar, Recibir…): él dice
//     si entran a la escala (CLAUDE.md, «Una función, una pieza»). Lo demás es el cobro de Vender, que no se pudo ver sin abrir una caja.
//     Solo baja. La reescribe `pnpm --filter web tema:esquinas:registro`; un archivo nuevo no puede nacer aquí.

/** Archivos enteros que no dibujan piezas de la interfaz, con su motivo. */
export const ESQUINA_FIJA: Record<string, string> = {
  // ---------- Permanentes ----------
  "app/estilos/rotulos-brother.css": "Dibuja la impresora Brother y los rótulos que salen de ella: son objetos físicos y sus esquinas son las del objeto",
};

/** Cuántas veces escribe una esquina a mano cada archivo. Solo baja. */
export const ESQUINA_A_MANO: Record<string, number> = {
  // ---------- Deuda: piezas de diseño propio (decide Felipe) y el cobro de Vender ----------
  "app/estilos/acompanante.css": 3,
  "app/estilos/ajuste-modelo.css": 9,
  "app/estilos/alta-parecidas.css": 8,
  "app/estilos/analisis-b.css": 2,
  "app/estilos/analisis-pedir.css": 5,
  "app/estilos/analisis-quieta.css": 1,
  "app/estilos/analisis.css": 19,
  "app/estilos/caja-cerrada.css": 5,
  "app/estilos/caja-comparativa.css": 1,
  "app/estilos/campana-hoja.css": 4,
  "app/estilos/club-publico.css": 15,
  "app/estilos/compra-celular.css": 6,
  "app/estilos/estados-financieros.css": 4,
  "app/estilos/etiqueta-prendas.css": 15,
  "app/estilos/etiquetas-precio.css": 2,
  "app/estilos/finanzas-bolsillos.css": 4,
  "app/estilos/finanzas-dinero.css": 10,
  "app/estilos/finanzas-que-debes.css": 3,
  "app/estilos/finanzas-recorrido.css": 2,
  "app/estilos/finanzas.css": 4,
  "app/estilos/gasto-rapido.css": 3,
  "app/estilos/guias.css": 6,
  "app/estilos/historial-prenda.css": 10,
  "app/estilos/inicio-almacen.css": 15,
  "app/estilos/movimientos-sellos.css": 7,
  "app/estilos/observatorio.css": 25,
  "app/estilos/ofertas.css": 11,
  "app/estilos/perfil-vidrio.css": 5,
  "app/estilos/recepcion-conteo.css": 5,
  "app/estilos/recepcion-viva.css": 8,
  "app/estilos/recordatorio-cierre.css": 9,
  "app/estilos/sellos.css": 8,
  "app/estilos/telar.css": 18,
  "app/estilos/tienda-web-conf.css": 14,
  "app/estilos/tienda-web.css": 9,
  "app/estilos/trafico.css": 9,
  "app/estilos/traslados-pases.css": 27,
  "app/estilos/ventas-sin-registrar.css": 2,
  "app/estilos/vidrio/caja.css": 1,
  "app/estilos/vidrio/config-vistas.css": 6,
  "app/estilos/vidrio/estados.css": 33,
  "app/estilos/vidrio/fusionar.css": 8,
  "app/estilos/vidrio/observatorio.css": 3,
  "app/estilos/vidrio/pantalla.css": 2,
  "app/estilos/vidrio/recibir-mesa.css": 17,
  "app/estilos/vidrio/rendimiento.css": 19,
  "app/estilos/vidrio/vender.css": 6,
  "app/estilos/vidrio/vitrinas-sedes.css": 4,
  "app/estilos/vista-rapida.css": 10,
  "app/globals.css": 9,
  "components/rendimiento/CifrasRendimiento.tsx": 2,
  "components/rendimiento/DetalleRendimiento.tsx": 1,
};

/** La deuda que queda: la suma de `ESQUINA_A_MANO`. Solo baja. Si SUBE, alguien declaró deuda nueva: no se puede. */
export const DEUDA_ESQUINA_HOY = 434;
