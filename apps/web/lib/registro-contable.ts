// Motor de "registro simple → partida doble". Convierte un evento en lenguaje de
// negocio (aporté dinero, compré una máquina, pagué el alquiler…) en las líneas
// debe/haber balanceadas que espera el RPC registrar_asiento. Puro TS, sin servidor:
// así el mismo cálculo alimenta la vista previa en pantalla y lo que se guarda.

export const IGV_TASA = 0.18;

export type LineaAsiento = { cuenta: string; debe: number; haber: number };

export type EventoId = "aporte_dinero" | "aporte_especie" | "gasto" | "compra" | "ingreso";

type MedioOpcion = { codigo: string; etiqueta: string };

export type EventoConfig = {
  id: EventoId;
  titulo: string;
  descripcion: string;
  origen: string; // para el asiento (apertura, gasto, compra, manual)
  /** Elementos de cuenta que puede elegir como "cuenta principal". Vacío = no aplica. */
  elementosPrincipal: string[];
  excluirCodigos?: string[];
  etiquetaPrincipal: string;
  usaIGV: boolean;
  medios?: MedioOpcion[];
  etiquetaMedio?: string;
  etiquetaMonto: string;
};

const MEDIOS_PAGO: MedioOpcion[] = [
  { codigo: "101", etiqueta: "Efectivo (sale de la caja)" },
  { codigo: "104", etiqueta: "Banco / transferencia / Yape" },
  { codigo: "421", etiqueta: "Al crédito (queda debiendo al proveedor)" },
];

const MEDIOS_COBRO: MedioOpcion[] = [
  { codigo: "101", etiqueta: "En efectivo (caja)" },
  { codigo: "104", etiqueta: "En el banco / Yape" },
];

export const EVENTOS: EventoConfig[] = [
  {
    id: "aporte_dinero",
    titulo: "Ingresó dinero (aporte / presupuesto)",
    descripcion: "Metiste plata a esta unidad. Sube tu caja o banco, y sube tu capital.",
    origen: "apertura",
    elementosPrincipal: [],
    etiquetaPrincipal: "",
    usaIGV: false,
    medios: MEDIOS_COBRO,
    etiquetaMedio: "¿Dónde entró?",
    etiquetaMonto: "Monto (S/)",
  },
  {
    id: "aporte_especie",
    titulo: "Registrar algo que YA tengo",
    descripcion: "Una máquina, telas, producto terminado, una garantía… que ya es tuyo. Entra como activo y como capital de apertura.",
    origen: "apertura",
    elementosPrincipal: ["activo"],
    etiquetaPrincipal: "¿Qué es?",
    usaIGV: false,
    etiquetaMonto: "Valor a costo (S/)",
  },
  {
    id: "gasto",
    titulo: "Registrar un gasto",
    descripcion: "Alquiler, luz, comisiones, confección tercerizada… algo que se consume.",
    origen: "gasto",
    elementosPrincipal: ["gasto"],
    excluirCodigos: ["691"], // el costo de ventas se genera solo con cada venta
    etiquetaPrincipal: "Tipo de gasto",
    usaIGV: true,
    medios: MEDIOS_PAGO,
    etiquetaMedio: "¿Cómo se pagó?",
    etiquetaMonto: "Total pagado (S/)",
  },
  {
    id: "compra",
    titulo: "Comprar un activo o mercadería",
    descripcion: "Una máquina, telas, mercadería para vender… algo que queda como activo.",
    origen: "compra",
    elementosPrincipal: ["activo"],
    etiquetaPrincipal: "¿Qué compraste?",
    usaIGV: true,
    medios: MEDIOS_PAGO,
    etiquetaMedio: "¿Cómo se pagó?",
    etiquetaMonto: "Total pagado (S/)",
  },
  {
    id: "ingreso",
    titulo: "Entró dinero (otro ingreso)",
    descripcion: "Un cobro pendiente, un ingreso que no es una venta de tienda.",
    origen: "manual",
    elementosPrincipal: ["ingreso"],
    etiquetaPrincipal: "¿Por qué entró?",
    usaIGV: false,
    medios: MEDIOS_COBRO,
    etiquetaMedio: "¿Dónde entró?",
    etiquetaMonto: "Monto (S/)",
  },
];

export function eventoPorId(id: EventoId): EventoConfig {
  return EVENTOS.find((e) => e.id === id)!;
}

export function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

export type RegistroInputs = {
  evento: EventoId;
  cuentaPrincipal?: string; // código de la cuenta principal
  medio?: string; // código de la contrapartida (caja/banco/crédito)
  monto: number; // total (con IGV si el evento y el usuario lo indican)
  incluyeIGV: boolean;
};

const CAPITAL = "501";
const IGV_CUENTA = "4011";

/** Devuelve las líneas balanceadas, o [] si aún faltan datos para armar el asiento. */
export function construirLineas(inp: RegistroInputs): LineaAsiento[] {
  const ev = EVENTOS.find((e) => e.id === inp.evento);
  if (!ev) return [];
  const total = redondear(inp.monto || 0);
  if (total <= 0) return [];

  const conIGV = ev.usaIGV && inp.incluyeIGV;
  const subtotal = conIGV ? redondear(total / (1 + IGV_TASA)) : total;
  const igv = conIGV ? redondear(total - subtotal) : 0;

  const lineas: LineaAsiento[] = [];
  switch (inp.evento) {
    case "aporte_dinero":
      if (!inp.medio) return [];
      lineas.push({ cuenta: inp.medio, debe: total, haber: 0 });
      lineas.push({ cuenta: CAPITAL, debe: 0, haber: total });
      break;
    case "aporte_especie":
      if (!inp.cuentaPrincipal) return [];
      lineas.push({ cuenta: inp.cuentaPrincipal, debe: total, haber: 0 });
      lineas.push({ cuenta: CAPITAL, debe: 0, haber: total });
      break;
    case "gasto":
    case "compra":
      if (!inp.cuentaPrincipal || !inp.medio) return [];
      lineas.push({ cuenta: inp.cuentaPrincipal, debe: subtotal, haber: 0 });
      if (igv > 0) lineas.push({ cuenta: IGV_CUENTA, debe: igv, haber: 0 });
      lineas.push({ cuenta: inp.medio, debe: 0, haber: total });
      break;
    case "ingreso":
      if (!inp.cuentaPrincipal || !inp.medio) return [];
      lineas.push({ cuenta: inp.medio, debe: total, haber: 0 });
      lineas.push({ cuenta: inp.cuentaPrincipal, debe: 0, haber: total });
      break;
  }
  return lineas.filter((l) => l.debe > 0 || l.haber > 0);
}

export function sumaDebe(ls: LineaAsiento[]): number {
  return redondear(ls.reduce((a, l) => a + l.debe, 0));
}
export function sumaHaber(ls: LineaAsiento[]): number {
  return redondear(ls.reduce((a, l) => a + l.haber, 0));
}
