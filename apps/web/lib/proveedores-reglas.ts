// Reglas puras de Proveedores (maquetas 08 y 09, ADR-0106). Sin I/O: se prueban sin base.

// ---------------------------------------------------------------------------
// Rubro: texto libre a propósito (ADR-0094) — sin vocabulario cerrado. Para que «Tela», «tela » y
// «Telas» no se partan en tres filtros se agrupa por una clave normalizada; se muestra la
// escritura más común de cada grupo.
// ---------------------------------------------------------------------------

export function claveRubro(rubro: string | null | undefined): string {
  return (rubro ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export type RubroConConteo = { clave: string; etiqueta: string; conteo: number };

/** Rubros distintos con su conteo, del más numeroso al menos; los proveedores sin rubro no cuentan. */
export function rubrosConConteo(proveedores: { rubro: string | null }[]): RubroConConteo[] {
  const grupos = new Map<string, { escrituras: Map<string, number>; conteo: number }>();
  for (const p of proveedores) {
    const k = claveRubro(p.rubro);
    if (!k) continue;
    const g = grupos.get(k) ?? { escrituras: new Map(), conteo: 0 };
    const escrita = (p.rubro ?? "").trim().replace(/\s+/g, " ");
    g.escrituras.set(escrita, (g.escrituras.get(escrita) ?? 0) + 1);
    g.conteo += 1;
    grupos.set(k, g);
  }
  return [...grupos.entries()]
    .map(([clave, g]) => ({ clave, etiqueta: [...g.escrituras.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0], conteo: g.conteo }))
    .sort((a, b) => b.conteo - a.conteo || a.etiqueta.localeCompare(b.etiqueta, "es"));
}

// ---------------------------------------------------------------------------
// Orden de la tabla: por saldo (a quién le debo más) por defecto.
// ---------------------------------------------------------------------------

export type CampoOrden = "saldo" | "facturado" | "ultima" | "nombre";
export type Orden = { campo: CampoOrden; dir: "asc" | "desc" };

type Ordenable = { nombre: string; saldo: number | null; facturado_12m: number | null; ultima_compra: string | null };

const VALOR: Record<CampoOrden, (p: Ordenable) => number | string | null> = {
  saldo: (p) => p.saldo,
  facturado: (p) => p.facturado_12m,
  ultima: (p) => p.ultima_compra,
  nombre: (p) => p.nombre,
};

/** Ordena sin mutar. Los valores vacíos (sin compras) van siempre al final, sea cual sea la dirección. */
export function ordenarProveedores<T extends Ordenable>(lista: T[], orden: Orden): T[] {
  const signo = orden.dir === "asc" ? 1 : -1;
  return [...lista].sort((a, b) => {
    const va = VALOR[orden.campo](a);
    const vb = VALOR[orden.campo](b);
    if (va == null && vb == null) return a.nombre.localeCompare(b.nombre, "es");
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "es");
    return c === 0 ? a.nombre.localeCompare(b.nombre, "es") : c * signo;
  });
}

/** Al tocar un encabezado: el mismo campo invierte; uno nuevo arranca en descendente (lo mayor primero), salvo el nombre. */
export function siguienteOrden(actual: Orden, campo: CampoOrden): Orden {
  if (actual.campo === campo) return { campo, dir: actual.dir === "desc" ? "asc" : "desc" };
  return { campo, dir: campo === "nombre" ? "asc" : "desc" };
}

// ---------------------------------------------------------------------------
// Entregas: lo que dice la columna «Entregas» de cada proveedor.
// ---------------------------------------------------------------------------

export type ChipEntregas = { tono: "ambar" | "neutro" | "verde"; texto: string };

/** Atrasadas (lo que hay que reclamar) > por recibir > al día. `null` si nunca se le compró. */
export function chipEntregas(p: { facturas: number | null; facturas_atrasadas: number | null; entregas_por_recibir: number | null }): ChipEntregas | null {
  if (!p.facturas) return null;
  const atrasadas = p.facturas_atrasadas ?? 0;
  if (atrasadas > 0) return { tono: "ambar", texto: `${atrasadas} ${atrasadas === 1 ? "atrasada" : "atrasadas"}` };
  const porRecibir = p.entregas_por_recibir ?? 0;
  if (porRecibir > 0) return { tono: "neutro", texto: `${porRecibir} por recibir` };
  return { tono: "verde", texto: "Al día" };
}

// ---------------------------------------------------------------------------
// Contacto
// ---------------------------------------------------------------------------

/**
 * Enlace de WhatsApp a partir del teléfono guardado. Un móvil peruano tiene 9 dígitos y empieza en
 * 9: se le antepone el 51. Si ya trae el 51 se respeta. Un fijo o un número raro devuelve `null`
 * (mejor sin botón que un botón que abre un chat equivocado).
 */
export function urlWhatsApp(telefono: string | null | undefined): string | null {
  const d = (telefono ?? "").replace(/\D/g, "");
  if (/^9\d{8}$/.test(d)) return `https://wa.me/51${d}`;
  if (/^519\d{8}$/.test(d)) return `https://wa.me/${d}`;
  return null;
}

// ---------------------------------------------------------------------------
// Evolución del costo
// ---------------------------------------------------------------------------

/** Variación porcentual del primer al último costo, con un decimal; `null` con menos de 2 puntos. */
export function variacionCosto(costos: number[]): number | null {
  if (costos.length < 2 || costos[0] <= 0) return null;
  return Math.round(((costos[costos.length - 1] - costos[0]) / costos[0]) * 1000) / 10;
}

/** ¿Sube en cada compra? Solo entonces se puede decir «sube en cada compra». */
export function subeEnCadaCompra(costos: number[]): boolean {
  return costos.length >= 2 && costos.every((c, i) => i === 0 || c > costos[i - 1]);
}
