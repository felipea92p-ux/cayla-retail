// Soporte de pruebas del Resumen: constructores de filas de la sede y de lo que
// tienen las otras sedes. Solo lo importan los `*.test.ts`; no entra a la app.
import { calcularUtilizable, type FilaResumen, type Ubicacion, type UbicacionRed } from "./resumen-reglas";

// «Ahora» de las pruebas: 18 sep. 2026, 18:24 en Lima.
export const AHORA = new Date("2026-09-18T18:24:00-05:00");
export const enDias = (n: number) => new Date(AHORA.getTime() + n * 86_400_000).toISOString();

export const TRUJILLO: Ubicacion = { id: "u-tru", nombre: "Tienda Trujillo", tipo: "tienda" };
export const TALLER: Ubicacion = { id: "u-taller", nombre: "Taller", tipo: "taller" };

let contador = 0;

/** Una variante en Tienda Trujillo con 30 días de historial sano; cada prueba pisa lo que le importa. */
export function fila(o: Partial<FilaResumen> = {}): FilaResumen {
  contador += 1;
  const piso = o.piso ?? 10;
  const almacen = o.almacen ?? 5;
  const sinUbicar = o.sinUbicar ?? 0;
  const separa = o.separaPisoAlmacen ?? true;
  const disponible = o.disponible ?? piso + almacen + sinUbicar;
  return {
    varianteId: `v${contador}`,
    productoId: "p1",
    productoCodigo: "BLU-0001",
    productoEstado: "activo",
    referencia: "Blusa Camila",
    categoriaId: "c-blusas",
    categoria: "Blusas",
    sku: `BLU-CAM-BLA-${contador}`,
    codigo: null,
    codigosBarras: [],
    talla: "M",
    colorCodigo: "BLA",
    color: "Blanco",
    colorHex: null,
    fotoUrl: null,
    precio: 100,
    costo: 40,
    estadoCosto: "oficial",
    stockMinimo: null,
    cuarentena: 0,
    primerIngreso: "2026-08-01T00:00:00Z",
    diasObservables: 30,
    diasConStock: 30,
    ledgerConsistente: true,
    stockInicial: 40,
    ventas: 30,
    devoluciones: 0,
    ultimaVenta: null,
    entradas: 0,
    mermas: 0,
    trasladosSalida: 0,
    ventasCmp: 0,
    devolucionesCmp: 0,
    diasConStockCmp: null,
    enCamino: 0,
    enCaminoATiempo: 0,
    enCaminoAtrasado: false,
    proximaLlegada: null,
    proximoTrasladoId: null,
    origenAbastecimiento: null,
    enRed: [],
    ...o,
    piso,
    almacen,
    sinUbicar,
    separaPisoAlmacen: separa,
    disponible,
    utilizable: o.utilizable ?? calcularUtilizable(separa, piso, almacen, disponible),
  };
}

export function taller(o: Partial<UbicacionRed> = {}): UbicacionRed {
  return {
    ubicacionId: "u-taller",
    nombre: "Taller",
    tipo: "taller",
    separaPisoAlmacen: false,
    disponible: 15,
    utilizable: 15,
    piso: 0,
    almacen: 15,
    diasObservables: 30,
    diasConStock: 30,
    ledgerConsistente: true,
    ventasVentana: 0,
    devolucionesVentana: 0,
    enCamino: 0,
    ...o,
  };
}

export function tienda(o: Partial<UbicacionRed> = {}): UbicacionRed {
  return {
    ubicacionId: "u-lim",
    nombre: "Tienda Lima",
    tipo: "tienda",
    separaPisoAlmacen: true,
    disponible: 50,
    utilizable: 50,
    piso: 10,
    almacen: 40,
    diasObservables: 30,
    diasConStock: 30,
    ledgerConsistente: true,
    ventasVentana: 30,
    devolucionesVentana: 0,
    enCamino: 0,
    ...o,
  };
}
