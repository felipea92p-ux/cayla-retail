// El aviso de Insumos: «la OP-3 ya cortó con esta tela y no tiene nada anotado» (ADR-0570, actividad 4; 2026-10-31). Sin React ni Supabase.
//
// EL PROBLEMA: una orden anotó su Corte cuando el estante del Taller no tenía esa tela; la tela se cargó después (saldo inicial, compra, «Encontré tela»). Nadie le avisó a quien la
// cargaba, y la orden quedó con la tela «por anotar»: su costo salía sin tela y «Pasar al stock» trabado. La base ya lo sabe (`fn_telas_cortadas_sin_anotar`); esto lo dice en
// Insumos, donde está la persona que carga la tela.
//
// CONTRATO
//   PROMETE: un aviso por orden, con el nombre de la tela en lenguaje de tienda («Satín Singapur · 6 colores», no seis filas), solo de las telas que ya tienen algo en el estante
//            (sin nada que descontar, el aviso no sirve: la página de la orden ya dice que falta recibirla); un orden estable por número; y que una respuesta mal formada de la base
//            se ignora fila por fila, nunca rompe la pantalla.
//   ASUME:   `fn_telas_cortadas_sin_anotar` ya filtró lo que importa (orden abierta, no muestra, Corte con prendas, libro sin consumo).
//   NO HACE: no descuenta nada, no calcula costos, no decide cuánto se usó (eso lo mide quien anota «cuánto quedó»), y no avisa de una orden que todavía no cortó.

export type TelaCortadaSinAnotar = {
  produccionId: string;
  numero: number;
  insumoId: string;
  nombre: string;
  unidad: string;
  /** Lo que el plan de la orden pide de esta tela (suma de sus colores). */
  plan: number;
  /** Lo que hay hoy en el estante del Taller. */
  saldo: number;
};

export type AvisoDeTelaCortada = {
  produccionId: string;
  /** «OP-000003», como en la URL de la orden. */
  numeroTexto: string;
  href: string;
  titulo: string;
  texto: string;
};

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Lo que devolvió la base, fila por fila: la que viene incompleta se descarta. */
export function leerTelasCortadasSinAnotar(crudo: unknown): TelaCortadaSinAnotar[] {
  if (!Array.isArray(crudo)) return [];
  const filas: TelaCortadaSinAnotar[] = [];
  for (const f of crudo) {
    if (typeof f !== "object" || f === null) continue;
    const r = f as Record<string, unknown>;
    const produccionId = texto(r.produccion_id);
    const insumoId = texto(r.insumo_id);
    const nombre = texto(r.nombre);
    const n = numero(r.numero);
    const plan = numero(r.plan);
    const saldo = numero(r.saldo);
    if (!produccionId || !insumoId || !nombre || n === null || plan === null || saldo === null) continue;
    filas.push({ produccionId, numero: n, insumoId, nombre, unidad: texto(r.unidad) ?? "", plan, saldo });
  }
  return filas;
}

const numeroTextoDe = (n: number) => `OP-${String(Math.round(n)).padStart(6, "0")}`;

/** «Satín Singapur · Perla» y «Satín Singapur · Vino» son una sola tela en dos colores: el aviso dice «Satín Singapur · 2 colores». */
function nombreDeLaTela(nombres: readonly string[]): string {
  const porBase = new Map<string, string[]>();
  for (const n of nombres) {
    const base = n.split(" · ")[0].trim() || n;
    porBase.set(base, [...(porBase.get(base) ?? []), n]);
  }
  const partes = [...porBase].map(([base, lista]) => (lista.length > 1 ? `${base} · ${lista.length} colores` : lista[0]));
  return partes.length < 2 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/** Los avisos de la pantalla de Insumos: uno por orden que ya cortó, con tela en el estante que su libro no descontó. */
export function avisosDeTelaCortada(filas: readonly TelaCortadaSinAnotar[]): AvisoDeTelaCortada[] {
  const porOrden = new Map<string, TelaCortadaSinAnotar[]>();
  for (const f of filas) {
    if (f.saldo <= 0 || f.plan <= 0) continue; // sin tela en el estante no hay nada que anotar todavía
    porOrden.set(f.produccionId, [...(porOrden.get(f.produccionId) ?? []), f]);
  }
  return [...porOrden.values()]
    .sort((a, b) => a[0].numero - b[0].numero)
    .map((telas) => {
      const num = numeroTextoDe(telas[0].numero);
      const cuales = nombreDeLaTela(telas.map((t) => t.nombre));
      return {
        produccionId: telas[0].produccionId,
        numeroTexto: num,
        href: `/produccion/ordenes/${num}`,
        titulo: `La ${num} ya cortó y no tiene su tela anotada`,
        texto: `Hay ${cuales} en el estante, pero la orden no descontó nada: su costo sale sin tela y no puede pasar al stock. Abre la orden y anota cuánto quedó.`,
      };
    });
}
