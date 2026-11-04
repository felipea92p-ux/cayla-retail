// Configuración ▸ Empresa y tiendas, «Las vitrinas» (Felipe 2026-11-04, docs/maquetas/empresa-tiendas-vitrinas-2026-11/). Lógica pura: una tarjeta por sede con
// lo que antes eran cuatro tablas (datos fiscales, WhatsApp, Preguntar y carga inicial) y lo que antes vivía en Metas (fondo de caja y hora de cierre).
//
// Contrato — PROMETE: juntar por sede lo que ya lee cada función de la base y decir qué le falta. ASUME: `hoy` es el de la base (`fn_carga_inicial_sedes().hoy`
// o `fn_configuracion_tiendas().hoy`). NO decide nada que la base no decida: un dato que la base no trajo no se dibuja ni cuenta como que falta.
//
// «Falta» es una decisión de Felipe (2026-11-04): en una tienda, WhatsApp, hora de cierre, fondo de caja y fecha de carga; en otra sede, solo la fecha de carga.
// Preguntar apagado NO falta: es una elección. Y que falte no bloquea nada: la guía avisa, las reglas de cada función siguen siendo las de siempre.

import { celularValido } from "./club-reglas";
import { colorDeSede, nombreCortoSede, type ColorSede } from "./finanzas-telar-reglas";
import { solesRedondo } from "./gastos-reglas";
import { estadoCargaInicial, fechaCorta, type EstadoCargaInicial, type LecturaCargaInicial } from "./carga-inicial-reglas";
import type { SedeAsistente } from "./asistente/sedes";
import type { DatosEmpresa, TiendaConfig } from "./configuracion-reglas";

export type CampoSede = "whatsapp" | "cierre" | "fondo" | "preguntar" | "carga";

// Prueba ciega de Formidable, 2026-11-04: «Preguntar» y «Carga inicial» no decían qué eran, y el QR no hacía pensar en WhatsApp.
export const NOMBRE_CAMPO: Record<CampoSede, string> = {
  whatsapp: "WhatsApp y QR",
  cierre: "Cierra",
  fondo: "Fondo de caja",
  preguntar: "Asistente CAYLA",
  carga: "Carga de stock inicial",
};

const NOMBRE_EN_FRASE: Record<CampoSede, string> = {
  whatsapp: "WhatsApp",
  cierre: "hora de cierre",
  fondo: "fondo de caja",
  preguntar: "asistente",
  carga: "fecha de carga",
};

export type VitrinaSede = {
  id: string;
  nombre: string;
  corto: string;
  tipo: "tienda" | "almacen" | "taller";
  color: ColorSede;
  /** «Jr. de la Unión 880, Lima», o null si la sede no tiene dirección fiscal. */
  direccion: string | null;
  series: string[];
  /** Solo las tiendas: el resto de las sedes no cobra a clientes. `null` en una que no lo es. */
  tienda: Pick<TiendaConfig, "metas" | "fondo" | "horaCierre" | "whatsappNumero"> | null;
  /** Preguntar en esta sede; `null` si la base no lo trajo (entonces el dato no se dibuja). */
  preguntar: boolean | null;
  /** La carga inicial; `null` si la base no la trajo (entonces el dato no se dibuja). */
  carga: { hasta: string | null; estado: EstadoCargaInicial } | null;
};

const TIPOS = new Set(["tienda", "almacen", "taller"]);
const ORDEN_TIPO = { tienda: 0, almacen: 1, taller: 2 } as const;

/** Une por sede lo que traen las cuatro lecturas. Sale una vitrina por cada sede que aparezca en alguna: primero las tiendas, en el orden de la base. */
export function armarVitrinas(entrada: {
  empresa: Pick<DatosEmpresa, "tiendas"> | null;
  tiendas: readonly TiendaConfig[];
  asistente: readonly SedeAsistente[] | null;
  carga: LecturaCargaInicial | null;
  hoy: string;
}): VitrinaSede[] {
  const { empresa, tiendas, asistente, carga, hoy } = entrada;
  const porId = new Map<string, { nombre: string; tipo: VitrinaSede["tipo"] }>();
  for (const t of tiendas) porId.set(t.id, { nombre: t.nombre, tipo: "tienda" });
  for (const s of asistente ?? []) if (!porId.has(s.id)) porId.set(s.id, { nombre: s.nombre, tipo: s.tipo });
  for (const s of carga?.sedes ?? []) {
    if (!porId.has(s.ubicacionId)) porId.set(s.ubicacionId, { nombre: s.nombre, tipo: TIPOS.has(s.tipo) ? (s.tipo as VitrinaSede["tipo"]) : "almacen" });
  }
  const hoyCarga = carga?.hoy ?? hoy;
  return [...porId.entries()]
    .map(([id, { nombre, tipo }], i) => {
      const fiscal = empresa?.tiendas.find((t) => t.id === id);
      const t = tiendas.find((x) => x.id === id);
      const a = asistente?.find((x) => x.id === id);
      const c = carga?.sedes.find((x) => x.ubicacionId === id);
      const vitrina: VitrinaSede = {
        id,
        nombre,
        corto: nombreCortoSede(nombre),
        tipo,
        color: colorDeSede({ nombre, tipo }),
        direccion: [fiscal?.direccion, fiscal?.distrito].filter(Boolean).join(", ") || null,
        series: (fiscal?.series ?? []).map((s) => s.serie),
        tienda: t ? { metas: t.metas, fondo: t.fondo, horaCierre: t.horaCierre, whatsappNumero: t.whatsappNumero } : null,
        preguntar: a ? a.encendido : null,
        carga: c ? { hasta: c.hasta, estado: estadoCargaInicial(c.hasta, hoyCarga) } : null,
      };
      return { vitrina, i };
    })
    .sort((a, b) => ORDEN_TIPO[a.vitrina.tipo] - ORDEN_TIPO[b.vitrina.tipo] || a.i - b.i)
    .map((x) => x.vitrina);
}

/** Los datos que se dibujan en la vitrina, en orden. */
export function camposDe(v: VitrinaSede): CampoSede[] {
  return [
    ...(v.tienda ? (["whatsapp", "cierre", "fondo"] as const) : []),
    ...(v.preguntar !== null ? (["preguntar"] as const) : []),
    ...(v.carga ? (["carga"] as const) : []),
  ];
}

/** ¿A este dato le falta algo? Un WhatsApp escrito que no es un celular cuenta como que falta: sin él, la tienda no muestra su QR. */
export function falta(v: VitrinaSede, c: CampoSede): boolean {
  if (c === "whatsapp") return !!v.tienda && !celularValido(v.tienda.whatsappNumero);
  if (c === "cierre") return !!v.tienda && !v.tienda.horaCierre;
  if (c === "fondo") return !!v.tienda && v.tienda.fondo === null;
  if (c === "carga") return v.carga?.estado.tipo === "sin_fecha";
  return false;
}

/** Los datos que cuentan en el aro: todos menos Preguntar. */
export function requeridos(v: VitrinaSede): CampoSede[] {
  return camposDe(v).filter((c) => c !== "preguntar");
}

/** Cuántos están listos, de cuántos. Sin nada que pedir, la sede no dibuja aro (`total` 0). */
export function avance(v: VitrinaSede): { hechos: number; total: number; completo: boolean } {
  const r = requeridos(v);
  const hechos = r.filter((c) => !falta(v, c)).length;
  return { hechos, total: r.length, completo: r.length > 0 && hechos === r.length };
}

/** Lo que el aro cuenta, en palabras: «Falta WhatsApp y hora de cierre». Sin nada que pedir, `null`: no hay nada que decir. */
export function fraseDeLaSede(v: VitrinaSede): string | null {
  const a = avance(v);
  if (!a.total) return null;
  if (a.completo) return "Todo listo";
  const f = requeridos(v).filter((c) => falta(v, c)).map((c) => NOMBRE_EN_FRASE[c]);
  const lista = f.length > 1 ? `${f.slice(0, -1).join(", ")} y ${f[f.length - 1]}` : f[0];
  return `Falta ${lista}`;
}

/** «21:00» → «9:00 p. m.». Si la base trae segundos («21:00:00»), se ignoran. */
export function hora12(h: string): string {
  const [a = 0, b = 0] = h.split(":").map(Number);
  return `${a % 12 || 12}:${String(b).padStart(2, "0")} ${a >= 12 ? "p. m." : "a. m."}`;
}

/** «987654321» → «987 654 321». Lo que no es un celular se muestra como vino. */
export function celularLegible(n: string): string {
  return celularValido(n) ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : n;
}

/** El dial va de las 6 de la mañana a la medianoche, en 270°: de −135° a 135°. Una hora fuera de ese tramo se queda en el borde. */
export function anguloDial(h: string): number {
  const [a = 0, b = 0] = h.split(":").map(Number);
  return ((Math.min(24, Math.max(6, a + b / 60)) - 6) / 18) * 270 - 135;
}

/** Hasta dónde llega el líquido del fondo, de 0 a 1. Es un dibujo, no una regla: S/ 500 lo llena, y lo que pase de ahí sigue lleno. */
export function nivelFondo(fondo: number | null, lleno = 500): number {
  if (fondo === null || !Number.isFinite(fondo) || fondo <= 0) return 0;
  return Math.min(1, fondo / lleno);
}

/** El arco del sello de la carga, de 0 a 1: los días que quedan, contra 45. Sin fecha o cerrada no hay arco. */
export function arcoCarga(e: EstadoCargaInicial): number {
  return e.tipo === "abierta" ? Math.min(1, Math.max(0.04, e.dias / 45)) : 0;
}

/** El valor que se lee, en la vitrina, para cada dato (lo que falta dice «Falta»). */
export function valorDe(v: VitrinaSede, c: CampoSede): string {
  if (falta(v, c)) return "Falta";
  if (c === "whatsapp") return celularLegible(v.tienda?.whatsappNumero ?? "");
  if (c === "cierre") return hora12(v.tienda?.horaCierre ?? "");
  if (c === "fondo") return solesRedondo(v.tienda?.fondo ?? 0);
  if (c === "preguntar") return v.preguntar ? "Activo" : "Apagado";
  const e = v.carga?.estado;
  if (e?.tipo === "cerrada") return `Cerró ${fechaCorta(e.hasta)}`;
  if (e?.tipo === "abierta") return `Hasta ${fechaCorta(e.hasta)}`;
  return "Falta";
}

/** ¿Esta cuenta puede abrir la hoja de la carga? La misma regla de siempre: la fecha la fija un líder, y reabrir una sede cerrada, solo un Admin. */
export function puedeCambiarCarga(e: EstadoCargaInicial, esLider: boolean, esAdmin: boolean): boolean {
  return esLider && (e.tipo !== "cerrada" || esAdmin);
}

/** Lo que el tubo de Preguntar llena, de 0 a 1. `null` si la base no dijo cuánto va gastado. */
export function llenadoTubo(gastado: number | null, tope: number): number | null {
  if (gastado === null || !Number.isFinite(gastado) || gastado < 0 || tope <= 0) return null;
  return Math.min(1, gastado / tope);
}
