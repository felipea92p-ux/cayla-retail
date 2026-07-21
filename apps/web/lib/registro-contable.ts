// Motor de "registro simple → partida doble". Convierte un evento en lenguaje de
// negocio (aporté dinero, compré una máquina, pagué el alquiler…) en las líneas
// debe/haber balanceadas que espera el RPC registrar_asiento. Puro TS, sin servidor:
// así el mismo cálculo alimenta la vista previa en pantalla y lo que se guarda.

export const IGV_TASA = 0.18;

export type LineaAsiento = { cuenta: string; debe: number; haber: number };

export type EventoId = "aporte_dinero" | "aporte_especie" | "gasto" | "compra" | "ingreso";

// ─── Comprobante (realidad peruana) ─────────────────────────────────────────
// El crédito de IGV SOLO existe con factura. Boleta y nota entran completos al
// costo. La verdad económica se registra siempre; el tratamiento tributario
// depende del papel. Así el sistema nunca reclama un crédito que SUNAT no permite.
export type Comprobante = "factura" | "boleta" | "nota";

export const COMPROBANTES: { id: Comprobante; etiqueta: string; nota: string }[] = [
  { id: "factura", etiqueta: "Factura", nota: "Con crédito de IGV" },
  { id: "boleta", etiqueta: "Boleta", nota: "Sin crédito de IGV" },
  { id: "nota", etiqueta: "Nota / sin comprobante", nota: "Sin crédito · igual entra" },
];

// ─── Subgrupo funcional de cada cuenta ──────────────────────────────────────
// Más fino que el "elemento" contable (activo/pasivo…): permite delimitar qué
// cuentas tienen sentido en cada acción, para no ofrecer opciones absurdas
// (comprar no puede ofrecer "Caja", registrar un gasto no ofrece la depreciación
// que el sistema calcula solo). Diseño para prevenir el error, no para avisarlo.
export const SUBGRUPO: Record<string, string> = {
  "101": "dinero",
  "104": "dinero",
  "121": "por_cobrar",
  "168": "otro_activo",
  "201": "inventario",
  "211": "produccion",
  "231": "produccion",
  "241": "inventario",
  "252": "inventario",
  "333": "activo_fijo",
  "336": "activo_fijo",
  "335": "activo_fijo",
  "391": "contra", // depreciación acumulada: nunca se elige a mano
  "421": "pasivo",
  "411": "pasivo",
  "4011": "igv",
  "4017": "pasivo",
  "451": "pasivo",
  "442": "pasivo",
  "501": "capital",
  "591": "resultado",
  "891": "resultado",
  "701": "ingreso",
  "702": "ingreso",
  "759": "ingreso",
  "691": "gasto_auto", // costo de ventas: lo genera la venta, no se registra a mano
  "601": "compra_periodica",
  "609": "gasto",
  "621": "gasto",
  "635": "gasto",
  "636": "gasto",
  "632": "gasto",
  "639": "gasto",
  "659": "gasto",
  "681": "gasto_auto", // depreciación del mes: la calcula el sistema
};

// Subtítulo con que se agrupan las opciones en el desplegable.
export const GRUPO_LABEL: Record<string, string> = {
  dinero: "Dinero",
  por_cobrar: "Por cobrar",
  inventario: "Inventario",
  produccion: "Producción",
  activo_fijo: "Máquinas y equipos",
  otro_activo: "Otros activos",
  gasto: "Gastos",
  ingreso: "Ingresos",
};

type MedioOpcion = { codigo: string; etiqueta: string };

export type EventoConfig = {
  id: EventoId;
  titulo: string;
  descripcion: string;
  origen: string; // para el asiento (apertura, gasto, compra, manual)
  /** Subgrupos de cuenta que puede elegir como "cuenta principal". Vacío = no aplica. */
  subgruposPrincipal: string[];
  etiquetaPrincipal: string;
  /** Muestra el selector de comprobante (define el IGV). Solo compra y gasto. */
  usaComprobante: boolean;
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
    subgruposPrincipal: [],
    etiquetaPrincipal: "",
    usaComprobante: false,
    medios: MEDIOS_COBRO,
    etiquetaMedio: "¿Dónde entró?",
    etiquetaMonto: "Monto (S/)",
  },
  {
    id: "aporte_especie",
    titulo: "Registrar algo que YA tengo",
    descripcion:
      "Una máquina, telas, producto terminado, una garantía… que ya es tuyo. Entra como activo y como capital de apertura. (El dinero va en 'Ingresó dinero'.)",
    origen: "apertura",
    subgruposPrincipal: ["inventario", "produccion", "activo_fijo", "otro_activo", "por_cobrar"],
    etiquetaPrincipal: "¿Qué es?",
    usaComprobante: false,
    etiquetaMonto: "Valor a costo (S/)",
  },
  {
    id: "gasto",
    titulo: "Registrar un gasto",
    descripcion: "Alquiler, luz, comisiones, confección tercerizada… algo que se consume.",
    origen: "gasto",
    subgruposPrincipal: ["gasto"],
    etiquetaPrincipal: "Tipo de gasto",
    usaComprobante: true,
    medios: MEDIOS_PAGO,
    etiquetaMedio: "¿Cómo se pagó?",
    etiquetaMonto: "Total pagado (S/)",
  },
  {
    id: "compra",
    titulo: "Comprar un activo o mercadería",
    descripcion: "Una máquina, telas, mercadería para vender… algo que queda como activo.",
    origen: "compra",
    subgruposPrincipal: ["activo_fijo", "inventario", "otro_activo"],
    etiquetaPrincipal: "¿Qué compraste?",
    usaComprobante: true,
    medios: MEDIOS_PAGO,
    etiquetaMedio: "¿Cómo se pagó?",
    etiquetaMonto: "Total pagado (S/)",
  },
  {
    id: "ingreso",
    titulo: "Entró dinero (otro ingreso)",
    descripcion: "Un cobro pendiente, un ingreso que no es una venta de tienda.",
    origen: "manual",
    subgruposPrincipal: ["ingreso", "por_cobrar"],
    etiquetaPrincipal: "¿Por qué entró?",
    usaComprobante: false,
    medios: MEDIOS_COBRO,
    etiquetaMedio: "¿Dónde entró?",
    etiquetaMonto: "Monto (S/)",
  },
];

export function eventoPorId(id: EventoId): EventoConfig {
  return EVENTOS.find((e) => e.id === id)!;
}

type CuentaMin = { codigo: string; nombre: string };
export type GrupoOpciones = { label: string; cuentas: CuentaMin[] };

/** Opciones de "cuenta principal" válidas para el evento, ya agrupadas por subtítulo. */
export function opcionesPrincipal(evento: EventoId, cuentas: CuentaMin[]): GrupoOpciones[] {
  const permitidos = new Set(eventoPorId(evento).subgruposPrincipal);
  const grupos: GrupoOpciones[] = [];
  for (const c of cuentas) {
    const sub = SUBGRUPO[c.codigo] ?? "";
    if (!permitidos.has(sub)) continue;
    const label = GRUPO_LABEL[sub] ?? "Otros";
    let g = grupos.find((x) => x.label === label);
    if (!g) {
      g = { label, cuentas: [] };
      grupos.push(g);
    }
    g.cuentas.push(c);
  }
  return grupos;
}

export function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

export type RegistroInputs = {
  evento: EventoId;
  cuentaPrincipal?: string; // código de la cuenta principal
  medio?: string; // código de la contrapartida (caja/banco/crédito)
  monto: number; // total pagado
  comprobante: Comprobante; // solo separa IGV cuando es factura
};

const CAPITAL = "501";
const IGV_CUENTA = "4011";

/** Devuelve las líneas balanceadas, o [] si aún faltan datos para armar el asiento. */
export function construirLineas(inp: RegistroInputs): LineaAsiento[] {
  const ev = EVENTOS.find((e) => e.id === inp.evento);
  if (!ev) return [];
  const total = redondear(inp.monto || 0);
  if (total <= 0) return [];

  // El crédito de IGV solo existe con FACTURA. Boleta y nota entran completos al costo.
  const conIGV = ev.usaComprobante && inp.comprobante === "factura";
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
