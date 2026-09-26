// Directorio de proveedores de Producción (ADR-0133, F4a; decisión D-H). Puro: sin Supabase ni React, para poder probarlo.
//
// Es un directorio APARTE del de Compras (`retail.proveedores`): acá están quienes le venden al Taller tela, avíos o
// maquila. Lo que se muestra de cada uno sale de lo que la base ya sabe —lotes recibidos, total comprado, última
// entrega—; saldo y cumplimiento llegan con los comprobantes y las recepciones de Producción (F4b a F4d), y no se
// inventan antes.

export type RubroProduccion = "tela" | "avios" | "maquila" | "otro";

export const RUBROS_PRODUCCION: { valor: RubroProduccion; etiqueta: string; ayuda: string }[] = [
  { valor: "tela", etiqueta: "Tela", ayuda: "Lino, popelina, punto… por metro o por kilo" },
  { valor: "avios", etiqueta: "Avíos", ayuda: "Botones, cierres, forros, hilos, etiquetas" },
  { valor: "maquila", etiqueta: "Maquila", ayuda: "Costura o corte hecho fuera del Taller" },
  { valor: "otro", etiqueta: "Otro", ayuda: "Cualquier otro proveedor del Taller" },
];

export function etiquetaRubro(rubro: string): string {
  return RUBROS_PRODUCCION.find((r) => r.valor === rubro)?.etiqueta ?? "Otro";
}

export type ProveedorProduccion = {
  id: string;
  nombre: string;
  rubro: RubroProduccion;
  ruc: string | null;
  contacto: string | null;
  telefono: string | null;
  plazoCreditoDias: number | null;
  formaPagoPreferida: string | null;
  banco: string | null;
  cuentaBancaria: string | null;
  cci: string | null;
  celularBilletera: string | null;
  billeteras: string[] | null;
  titularCuenta: string | null;
  activo: boolean;
  lotes: number;
  totalComprado: number;
  /** `YYYY-MM-DD` o `null` si nunca entregó. */
  ultimaEntrega: string | null;
};

export const ETIQUETA_FORMA_PAGO: Record<string, string> = {
  transferencia: "Transferencia",
  yape: "Yape",
  plin: "Plin",
  efectivo: "Efectivo",
  deposito: "Depósito",
  otro: "Otro",
};

/** «crédito 30 d» o «contado»: cómo se le paga. `null` plazo = contado (no se inventa un plazo). */
export function condicionDePago(plazoCreditoDias: number | null): string {
  return plazoCreditoDias && plazoCreditoDias > 0 ? `crédito ${plazoCreditoDias} d` : "contado";
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type FiltroProveedores = { rubro: RubroProduccion | "todos"; busqueda: string; verArchivados: boolean };

/** Filtra por rubro, por texto (nombre, RUC o contacto, sin importar tildes ni mayúsculas) y por estado. Los archivados
 *  solo se ven si se pide. Orden: activos primero, luego por nombre. */
export function filtrarProveedores(lista: ProveedorProduccion[], f: FiltroProveedores): ProveedorProduccion[] {
  const q = sinTildes(f.busqueda.trim());
  return lista
    .filter((p) => (f.verArchivados ? true : p.activo))
    .filter((p) => f.rubro === "todos" || p.rubro === f.rubro)
    .filter((p) => q === "" || sinTildes(p.nombre).includes(q) || (p.ruc ?? "").includes(q) || sinTildes(p.contacto ?? "").includes(q))
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, "es"));
}

export type ResumenProveedores = { activos: number; archivados: number; totalComprado: number; lotes: number; porRubro: Record<RubroProduccion, number> };

export function resumenProveedores(lista: ProveedorProduccion[]): ResumenProveedores {
  const porRubro: Record<RubroProduccion, number> = { tela: 0, avios: 0, maquila: 0, otro: 0 };
  let activos = 0;
  let totalComprado = 0;
  let lotes = 0;
  for (const p of lista) {
    if (p.activo) {
      activos++;
      porRubro[p.rubro]++;
    }
    totalComprado += p.totalComprado;
    lotes += p.lotes;
  }
  return { activos, archivados: lista.length - activos, totalComprado, lotes, porRubro };
}

/** Un proveedor sin ningún dato de pago no se le puede pagar sin preguntar: se dice en la lista, sin adornos. */
export function sinDatosDePago(p: Pick<ProveedorProduccion, "cci" | "cuentaBancaria" | "celularBilletera">): boolean {
  return !p.cci && !p.cuentaBancaria && !p.celularBilletera;
}
