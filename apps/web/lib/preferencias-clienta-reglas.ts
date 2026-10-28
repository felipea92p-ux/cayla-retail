// Las preferencias de una socia (CL-5, ADR-0288 «Actualización 2026-09-30 (f)»): tres listas fijas —Ocasión, Estilo y Evita
// (un color o una tela)— que se marcan en su ficha. Sin nota libre: no se puede filtrar y ahí se cuelan datos de salud que la
// Ley 29733 protege aparte. Los valores viven en `retail.club_etiquetas` (valores de trabajo del spike; Felipe los puede
// cambiar). Aquí, sin React ni red: leer lo guardado, marcar y desmarcar, y qué se manda a guardar.
//
// CONTRATO
//   PROMETE: `leerPreferencias` nunca falla con lo que venga de la base (lo raro se ignora); `alternar` no repite valores;
//            `paraGuardar` no manda grupos vacíos; `opcionesDelGrupo` muestra el catálogo activo y, aparte, lo que ella ya
//            tenía y ya no está en la lista (la base se lo conserva, así que no se le esconde).
//   ASUME:   el catálogo llega de `fn_club_etiquetas` (solo activos, en orden).
//   NO HACE: no valida contra el catálogo: eso lo hace `guardar_preferencias_clienta` (hint `preferencia_invalida`).

export type GrupoPreferencia = "ocasion" | "estilo" | "evita";

/** Los tres grupos, en el orden y con los títulos del spike del club (`ETQ_T` de 20-datos.js). */
export const GRUPOS_PREFERENCIA: readonly { clave: GrupoPreferencia; titulo: string }[] = [
  { clave: "ocasion", titulo: "Ocasión" },
  { clave: "estilo", titulo: "Estilo" },
  { clave: "evita", titulo: "Evita (un color o una tela)" },
];

export type Preferencias = Partial<Record<GrupoPreferencia, readonly string[]>>;
export type EtiquetaClub = { grupo: GrupoPreferencia; valor: string; orden: number };

const ES_GRUPO = new Set<string>(GRUPOS_PREFERENCIA.map((g) => g.clave));

/** Lo guardado en `clientas.preferencias` (jsonb), leído sin confiar en su forma: solo grupos conocidos y valores de texto. */
export function leerPreferencias(valor: unknown): Preferencias {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  const salida: Preferencias = {};
  for (const [grupo, valores] of Object.entries(valor as Record<string, unknown>)) {
    if (!ES_GRUPO.has(grupo) || !Array.isArray(valores)) continue;
    const textos = [...new Set(valores.filter((v): v is string => typeof v === "string"))];
    if (textos.length) salida[grupo as GrupoPreferencia] = textos;
  }
  return salida;
}

/** Lo que devuelve `fn_club_etiquetas`, sin los grupos que la web no conoce. */
export function leerEtiquetas(filas: readonly { grupo: string; valor: string; orden: number }[]): EtiquetaClub[] {
  return filas.filter((f) => ES_GRUPO.has(f.grupo)).map((f) => ({ grupo: f.grupo as GrupoPreferencia, valor: f.valor, orden: f.orden }));
}

export function estaMarcada(p: Preferencias, grupo: GrupoPreferencia, valor: string): boolean {
  return (p[grupo] ?? []).includes(valor);
}

/** Marca o desmarca un valor (sin repetirlo). Devuelve un objeto nuevo. */
export function alternar(p: Preferencias, grupo: GrupoPreferencia, valor: string): Preferencias {
  const actuales = p[grupo] ?? [];
  const nuevos = actuales.includes(valor) ? actuales.filter((v) => v !== valor) : [...actuales, valor];
  return { ...p, [grupo]: nuevos };
}

/** Lo que va a `guardar_preferencias_clienta`: sin grupos vacíos. */
export function paraGuardar(p: Preferencias): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const { clave } of GRUPOS_PREFERENCIA) {
    const valores = p[clave] ?? [];
    if (valores.length) salida[clave] = [...valores];
  }
  return salida;
}

/** ¿Marcan lo mismo? (sin importar el orden): si sí, no hay nada que guardar. */
export function mismasPreferencias(a: Preferencias, b: Preferencias): boolean {
  return GRUPOS_PREFERENCIA.every(({ clave }) => {
    const x = [...(a[clave] ?? [])].sort();
    const y = [...(b[clave] ?? [])].sort();
    return x.length === y.length && x.every((v, i) => v === y[i]);
  });
}

export type OpcionPreferencia = { valor: string; enLaLista: boolean };

/** Los botones de un grupo: el catálogo activo en su orden y, al final, lo que ella tiene marcado y ya no está en la lista. */
export function opcionesDelGrupo(catalogo: readonly EtiquetaClub[], grupo: GrupoPreferencia, marcadas: Preferencias): OpcionPreferencia[] {
  const activas = catalogo.filter((e) => e.grupo === grupo).sort((a, b) => a.orden - b.orden);
  const enLaLista = new Set(activas.map((e) => e.valor));
  return [
    ...activas.map((e) => ({ valor: e.valor, enLaLista: true })),
    ...(marcadas[grupo] ?? []).filter((v) => !enLaLista.has(v)).map((valor) => ({ valor, enLaLista: false })),
  ];
}

/** Cuántos valores tiene marcados en total. */
export function cuantasMarcadas(p: Preferencias): number {
  return GRUPOS_PREFERENCIA.reduce((n, { clave }) => n + (p[clave]?.length ?? 0), 0);
}
