import { diaLima, diaMes, diasEntreFechas, hoyLima, horaLima } from "./fechas-lima";
import type { TonoChip } from "@/components/ui/Chip";

// Mis compras ▸ Mis envíos (ADR-0480, maqueta docs/maquetas/mis-compras-envios-2026-10/, Felipe 2026-10-26): los envíos que mandó la
// compradora, con su código (ENV-000118) para avisar a la tienda qué buscar en Recibir, agrupados por la ronda en que salieron. Las reglas
// puras: leer lo que manda `fn_mis_envios` (que puede venir vieja o rota: nunca se cae, descarta lo ilegible), en qué quedó cada envío
// dicho en palabras de tienda y cómo se resume una ronda. Es de solo lectura: ninguna regla de negocio nueva. Sin Supabase.

// Cada llamada nombra su constante (`.rpc(RPC_X as never, …)`): así la lee la prueba de cobertura de roles.
export const RPC_MIS_ENVIOS = "fn_mis_envios";

export type EstadoEnvio = "en_camino" | "abierto" | "cerrado" | "anulado";
const ESTADOS: readonly EstadoEnvio[] = ["en_camino", "abierto", "cerrado", "anulado"];

export type LineaEnvio = { nombre: string; cantidad: number };

export type EnvioMio = {
  id: string;
  /** El código que se avisa a la tienda y se busca en Recibir: «ENV-000118». */
  numero: string;
  estado: EstadoEnvio;
  destinoId: string | null;
  destino: string;
  fardos: number;
  salioEn: string;
  abiertoEn: string | null;
  cerradoEn: string | null;
  cerradoPor: string | null;
  anuladoEn: string | null;
  motivoAnulacion: string | null;
  /** Cuántas prendas salieron y cuántas contó la tienda. */
  prendas: number;
  contadas: number;
  rondaId: string | null;
  ronda: string | null;
  rondaAbiertaEn: string | null;
  rondaCerradaEn: string | null;
  /** Las compras (papeles) que salieron en este envío. */
  papelIds: string[];
  lineas: LineaEnvio[];
};

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

function leerLinea(x: unknown): LineaEnvio | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const nombre = texto(o.nombre);
  const cantidad = numero(o.cantidad);
  return nombre && cantidad !== null && cantidad > 0 ? { nombre, cantidad } : null;
}

function leerEnvio(x: unknown): EnvioMio | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const id = texto(o.id);
  const codigo = texto(o.numero);
  const salioEn = texto(o.despachado_en);
  const estado = ESTADOS.includes(o.estado as EstadoEnvio) ? (o.estado as EstadoEnvio) : null;
  if (!id || !codigo || !salioEn || !estado) return null;
  return {
    id,
    numero: codigo,
    estado,
    destinoId: texto(o.destino_id),
    destino: texto(o.destino) ?? "la tienda",
    fardos: Math.max(1, numero(o.bultos) ?? 1),
    salioEn,
    abiertoEn: texto(o.abierto_en),
    cerradoEn: texto(o.cerrado_en),
    cerradoPor: texto(o.cerrado_por),
    anuladoEn: texto(o.anulado_en),
    motivoAnulacion: texto(o.motivo_anulacion),
    prendas: numero(o.unidades) ?? 0,
    contadas: numero(o.contadas) ?? 0,
    rondaId: texto(o.ronda_id),
    ronda: texto(o.ronda),
    rondaAbiertaEn: texto(o.ronda_abierta_en),
    rondaCerradaEn: texto(o.ronda_cerrada_en),
    papelIds: (Array.isArray(o.papel_ids) ? o.papel_ids : []).map(texto).filter((p): p is string => p !== null),
    lineas: (Array.isArray(o.lineas) ? o.lineas : []).map(leerLinea).filter((l): l is LineaEnvio => l !== null),
  };
}

/** Lo que manda `fn_mis_envios`, del más nuevo al más viejo. Ilegible: ninguno (la pantalla dice si no se pudo leer; no inventa). */
export function leerMisEnvios(data: unknown): EnvioMio[] {
  return (Array.isArray(data) ? data : []).map(leerEnvio).filter((e): e is EnvioMio => e !== null);
}

/** Lo que devuelve `mandar_compras_a_tienda` al salir un envío: lo justo para mostrar su código apenas sale. */
export type EnvioSalido = { numero: string; destino: string; prendas: number; fardos: number };

export function leerEnvioSalido(data: unknown): EnvioSalido | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const codigo = texto(o.numero);
  if (!codigo) return null;
  return { numero: codigo, destino: texto(o.sede) ?? "la tienda", prendas: numero(o.unidades) ?? 0, fardos: Math.max(1, numero(o.bultos) ?? 1) };
}

// ---------- Cómo quedó cada envío ----------

export const ESTADO_ENVIO: Record<EstadoEnvio, { texto: string; tono: TonoChip }> = {
  en_camino: { texto: "En camino", tono: "pizarra" },
  abierto: { texto: "La tienda lo cuenta", tono: "ambar" },
  cerrado: { texto: "Recibido", tono: "verde" },
  anulado: { texto: "Anulado", tono: "apagado" },
};

/** Cuántos días en camino sin que la tienda lo abra para recordarle el código. */
export const DIAS_PARA_RECORDAR = 2;

/** Cuántas prendas faltaron: lo que salió menos lo que la tienda contó, ya recibido. 0 si no falta nada (o si aún no se recibe). */
export function prendasQueFaltaron(e: Pick<EnvioMio, "estado" | "prendas" | "contadas">): number {
  return e.estado === "cerrado" ? Math.max(0, e.prendas - e.contadas) : 0;
}

/** Días que lleva en camino sin que la tienda lo abra, solo si ya pasó el plazo para recordarlo. `null` si no aplica. */
export function diasSinAbrir(e: Pick<EnvioMio, "estado" | "salioEn">, hoy: string = hoyLima()): number | null {
  if (e.estado !== "en_camino") return null;
  const dia = diaLima(e.salioEn);
  if (!dia) return null;
  const dias = diasEntreFechas(dia, hoy);
  return dias >= DIAS_PARA_RECORDAR ? dias : null;
}

/** «Hoy 09:48», «Ayer 16:20», «24/10 16:20»: cuándo salió, en hora de Lima. */
export function cuandoSalio(e: Pick<EnvioMio, "salioEn">, hoy: string = hoyLima()): string {
  const dia = diaLima(e.salioEn);
  const hora = horaLima(e.salioEn);
  if (!dia) return "";
  const cuando = dia === hoy ? "Hoy" : diasEntreFechas(dia, hoy) === 1 ? "Ayer" : diaMes(dia);
  return hora ? `${cuando} ${hora}` : cuando;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Bajo el código recién salido: «8 prendas · 1 fardo». */
export function resumenDelEnvioSalido(e: Pick<EnvioSalido, "prendas" | "fardos">): string {
  return `${plural(e.prendas, "prenda", "prendas")} · ${plural(e.fardos, "fardo", "fardos")}`;
}

/** Bajo el código en una fila: «Hoy 09:48 · 8 prendas · 1 fardo». Con `conRonda`, también la ronda (en una búsqueda de todas). */
export function detalleDeEnvio(e: EnvioMio, hoy: string = hoyLima(), conRonda = false): string {
  return [cuandoSalio(e, hoy), plural(e.prendas, "prenda", "prendas"), plural(e.fardos, "fardo", "fardos"), conRonda ? e.ronda : null]
    .filter(Boolean)
    .join(" · ");
}

/** La nota de color que lleva una fila al lado del chip: lo que faltó o los días sin recibir. */
export function notaDeEnvio(e: EnvioMio, hoy: string = hoyLima()): string | null {
  const faltaron = prendasQueFaltaron(e);
  if (faltaron > 0) return `faltaron ${faltaron}`;
  const dias = diasSinAbrir(e, hoy);
  return dias !== null ? `hace ${dias} días` : null;
}

export type PasoDeEnvio = { estado: "hecho" | "ahora" | "falta"; texto: string };

/** La historia de un envío en tres pasos: salió · la tienda lo cuenta · recibido. */
export function lineaDeTiempo(e: EnvioMio, hoy: string = hoyLima()): PasoDeEnvio[] {
  const salio: PasoDeEnvio = { estado: "hecho", texto: `Salió · ${cuandoSalio(e, hoy)}` };
  if (e.estado === "anulado") return [salio, { estado: "hecho", texto: `Se anuló${e.motivoAnulacion ? `: ${e.motivoAnulacion}` : ""}` }];
  if (e.estado === "cerrado") {
    const cuando = e.cerradoEn ? ` · ${cuandoSalio({ salioEn: e.cerradoEn }, hoy)}` : "";
    return [
      salio,
      { estado: "hecho", texto: "La tienda lo abrió y lo contó" },
      { estado: "hecho", texto: `Recibido${cuando}${e.cerradoPor ? ` por ${e.cerradoPor}` : ""}` },
    ];
  }
  if (e.estado === "abierto") return [salio, { estado: "ahora", texto: "La tienda lo está contando" }, { estado: "falta", texto: "Recibido" }];
  return [salio, { estado: "ahora", texto: "En camino: la tienda todavía no lo abre" }, { estado: "falta", texto: "Recibido" }];
}

export type AvisoDeEnvio = { titulo: string; texto: string };

/** El aviso ámbar de un envío: salió hace días y nadie lo abrió, o la tienda contó menos. Nada más: no inventa culpables. */
export function avisosDeEnvio(e: EnvioMio, hoy: string = hoyLima()): AvisoDeEnvio[] {
  const avisos: AvisoDeEnvio[] = [];
  const dias = diasSinAbrir(e, hoy);
  if (dias !== null) {
    avisos.push({
      titulo: `Salió hace ${dias} días y la tienda no lo abrió`,
      texto: `Avísale a ${e.destino.replace(/^Tienda /, "")} el código ${e.numero}: lo busca en Recibir.`,
    });
  }
  const faltaron = prendasQueFaltaron(e);
  if (faltaron > 0) {
    avisos.push({
      titulo: `La tienda contó ${e.contadas} de ${e.prendas}`,
      texto: `Faltaron ${faltaron}: Compras lo revisa con el proveedor.`,
    });
  }
  return avisos;
}

/** «RC-000612 · abierta», «RC-000611 · cerrada»; sin ronda (una compra de antes de las rondas), «Antes de las rondas». */
export function textoDeRondaDelEnvio(e: Pick<EnvioMio, "ronda" | "rondaCerradaEn">): string {
  if (!e.ronda) return "Antes de las rondas";
  return `${e.ronda} · ${e.rondaCerradaEn ? "cerrada" : "abierta"}`;
}

// ---------- Compartir el código ----------

/** Lo que se le manda a la tienda por WhatsApp: el código, lo que lleva y dónde buscarlo. */
export function mensajeParaLaTienda(e: Pick<EnvioMio, "numero" | "destino" | "prendas" | "fardos">): string {
  return `Hola, te mandé el envío ${e.numero} a ${e.destino}: ${plural(e.prendas, "prenda", "prendas")} en ${plural(e.fardos, "fardo", "fardos")}. Búscalo en Recibir con ese código.`;
}

export function enlaceDeWhatsapp(mensaje: string): string {
  return `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
}

// ---------- Por ronda, buscar y filtrar ----------

export type FiltroEnvios = "todos" | "sin_recibir" | "recibidos";
export const FILTROS_ENVIOS: readonly { clave: FiltroEnvios; nombre: string }[] = [
  { clave: "todos", nombre: "Todos" },
  { clave: "sin_recibir", nombre: "Sin recibir" },
  { clave: "recibidos", nombre: "Recibidos" },
];

const sinRecibir = (e: Pick<EnvioMio, "estado">) => e.estado === "en_camino" || e.estado === "abierto";

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** ¿El envío pasa el filtro de estado y lo buscado (código, tienda o ronda)? Un número suelto («104») encuentra «ENV-000104». */
export function coincideEnvio(e: EnvioMio, filtro: FiltroEnvios, q: string): boolean {
  if (filtro === "sin_recibir" && !sinRecibir(e)) return false;
  if (filtro === "recibidos" && e.estado !== "cerrado") return false;
  const buscado = normalizar(q);
  if (!buscado) return true;
  return [e.numero, e.destino, e.ronda ?? ""].some((campo) => normalizar(campo).includes(buscado));
}

/** Un chip que resume cómo va una ronda con sus envíos. `null` si no mandó nada. */
export type ResumenDeEnvios = { texto: string; chip: { texto: string; tono: TonoChip } | null };

export function resumenDeEnvios(envios: readonly EnvioMio[], hoy: string = hoyLima()): ResumenDeEnvios {
  const vivos = envios.filter((e) => e.estado !== "anulado");
  if (vivos.length === 0) return { texto: "Sin envíos", chip: null };
  const prendas = vivos.reduce((s, e) => s + e.prendas, 0);
  const texto = `${plural(vivos.length, "envío", "envíos")} · ${plural(prendas, "prenda", "prendas")}`;
  const faltan = vivos.filter(sinRecibir).length;
  const conDiferencias = vivos.filter((e) => prendasQueFaltaron(e) > 0).length;
  if (faltan > 0) {
    const atrasado = vivos.some((e) => diasSinAbrir(e, hoy) !== null);
    return { texto, chip: { texto: `${faltan} sin recibir`, tono: atrasado ? "ambar" : "pizarra" } };
  }
  if (conDiferencias > 0) return { texto, chip: { texto: `${conDiferencias} con diferencias`, tono: "ambar" } };
  return { texto, chip: { texto: "Todo recibido", tono: "verde" } };
}

export type RondaConEnvios = {
  /** `null`: los de antes de las rondas. */
  rondaId: string | null;
  texto: string;
  abiertaEn: string | null;
  cerradaEn: string | null;
  envios: EnvioMio[];
};

/** Los envíos de una ronda (la abierta, normalmente). */
export function enviosDeLaRonda(envios: readonly EnvioMio[], rondaId: string | null): EnvioMio[] {
  return rondaId ? envios.filter((e) => e.rondaId === rondaId) : [];
}

/**
 * «Para mandar» (maqueta mis-compras-pc-mesa, Felipe 2026-10-28): cuántas de las prendas de la ronda ya salieron. Lo mandado es lo de los envíos
 * de la ronda que no se anularon; lo que falta, lo que sigue por mandar a las tiendas. Sin nada de ninguno de los dos, no hay qué medir.
 * El porcentaje se redondea hacia abajo: solo llega a 100 cuando ya salió todo.
 */
export function avanceDeEnvios(
  porMandar: readonly { unidades: number }[],
  envios: readonly Pick<EnvioMio, "estado" | "prendas">[],
): { mandadas: number; total: number; pct: number; texto: string } | null {
  const faltan = porMandar.reduce((s, t) => s + Math.max(0, t.unidades), 0);
  const mandadas = envios.filter((e) => e.estado !== "anulado").reduce((s, e) => s + Math.max(0, e.prendas), 0);
  const total = mandadas + faltan;
  if (total <= 0) return null;
  return { mandadas, total, pct: Math.floor((mandadas / total) * 100), texto: `${mandadas} de ${total} ${total === 1 ? "prenda mandada" : "prendas mandadas"}` };
}

/** Los de las rondas anteriores (todo lo que no es de la abierta), una tarjeta por ronda, la más nueva primero. */
export function rondasConEnvios(envios: readonly EnvioMio[], rondaAbiertaId: string | null): RondaConEnvios[] {
  const grupos = new Map<string, RondaConEnvios>();
  for (const e of envios) {
    if (rondaAbiertaId && e.rondaId === rondaAbiertaId) continue;
    const clave = e.rondaId ?? "sin-ronda";
    const g = grupos.get(clave) ?? {
      rondaId: e.rondaId,
      texto: e.ronda ?? "Antes de las rondas",
      abiertaEn: e.rondaAbiertaEn,
      cerradaEn: e.rondaCerradaEn,
      envios: [],
    };
    g.envios.push(e);
    grupos.set(clave, g);
  }
  const ms = (t: string | null) => (t ? Date.parse(t) || 0 : 0);
  return [...grupos.values()]
    .map((g) => ({ ...g, envios: [...g.envios].sort((a, b) => ms(b.salioEn) - ms(a.salioEn)) }))
    .sort((a, b) => (a.rondaId === null ? 1 : b.rondaId === null ? -1 : ms(b.cerradaEn ?? b.abiertaEn) - ms(a.cerradaEn ?? a.abiertaEn)));
}

/** Los envíos de una fila de ronda del historial: su clave es `ronda-<id>` (`ronda-sin-ronda` para lo de antes de las rondas). `null`: no se pudieron leer los envíos. */
export function enviosDeLaFila(rondas: RondaConEnvios[] | null, clave: string): EnvioMio[] | null {
  if (!rondas) return null;
  const id = clave.replace(/^ronda-/, "");
  return rondas.find((r) => (r.rondaId ?? "sin-ronda") === id)?.envios ?? null;
}

/** «22 – 24 oct» no hace falta: «22/10 al 24/10», o «23/10» si fue el mismo día. Sin fechas, nada. */
export function diasDeLaRonda(abiertaEn: string | null, cerradaEn: string | null): string {
  const a = diaLima(abiertaEn);
  const c = diaLima(cerradaEn);
  if (!a && !c) return "";
  if (a && c && a !== c) return `${diaMes(a)} al ${diaMes(c)}`;
  return diaMes(c ?? a);
}

/** Los códigos de cada compra (papel), para decir «enviada · ENV-000118» en la lista. */
export function codigosPorCompra(envios: readonly EnvioMio[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of envios) {
    if (e.estado === "anulado") continue;
    for (const p of e.papelIds) m.set(p, [...(m.get(p) ?? []), e.numero]);
  }
  for (const [p, cods] of m) m.set(p, [...new Set(cods)].sort());
  return m;
}
