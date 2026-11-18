import type { TipoInsumo } from "./insumos-reglas";

// Los ejemplos de «Nuevo insumo» siguen lo que la persona ya eligió (skill `/sugerir`, CLAUDE.md «Sugerencias coherentes»; ADR-0290). Sin React ni red.
//
// El problema: «Lino lavado crudo» escrito en la caja a quien elige un botón le dice que su nombre parece el de una tela, y un código de ejemplo que ya existe lleva a un «ya hay un insumo con ese código».
// De dónde sale cada texto: el TIPO (tela o avío) y, dentro de él, el primer ejemplo de la tabla curada que NO esté ya en el catálogo (ni su código ni su nombre). Si todos están usados, un texto neutro que
// no promete nada. Mismo contexto, mismo texto: sin azar y sin red.

export type SugerenciaDeInsumo = { codigo: string; nombre: string; nota: string; origen: "tabla" | "neutro" };

type Ejemplo = { codigo: string; nombre: string };

const EJEMPLOS: Record<TipoInsumo, readonly Ejemplo[]> = {
  tela: [
    { codigo: "LIN-01", nombre: "Lino lavado crudo" },
    { codigo: "POP-01", nombre: "Popelina blanca" },
    { codigo: "GAB-01", nombre: "Gabardina negra" },
    { codigo: "SAT-01", nombre: "Satín marfil" },
    { codigo: "JER-01", nombre: "Jersey de algodón gris" },
  ],
  avio: [
    { codigo: "BOT-01", nombre: "Botón nácar 18 mm" },
    { codigo: "CIE-01", nombre: "Cierre invisible 40 cm" },
    { codigo: "HIL-01", nombre: "Hilo poliéster negro" },
    { codigo: "ETI-01", nombre: "Etiqueta tejida CAYLA" },
    { codigo: "ELA-01", nombre: "Elástico plano 2 cm" },
  ],
};

const NOTA: Record<TipoInsumo, string> = { tela: "Ancho, composición, proveedor habitual…", avio: "Medida, material, proveedor habitual…" };
const NEUTRO: Record<TipoInsumo, { codigo: string; nombre: string }> = { tela: { codigo: "Código de la tela", nombre: "Nombre de la tela" }, avio: { codigo: "Código del avío", nombre: "Nombre del avío" } };

const clave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * Los ejemplos de «Nuevo avío» siguen a la CLASE elegida (ADR-0290 / ADR-0580): con «Hilo» elegido, la caja de nombre no puede decir «Botón nácar».
 *
 * Se indexa por el PREFIJO de la clase, nunca por su nombre visible: el líder renombra una clase en Catálogo ▸ Atributos y el ejemplo tiene que seguir acertando. Una clase que el líder crea
 * (nace con un prefijo derivado de su nombre y sin fila aquí) cae al texto neutro, nunca al ejemplo de otra clase.
 */
const EJEMPLOS_AVIO: Record<string, { nombre: string; nota: string }> = {
  BOT: { nombre: "Botón nácar", nota: "Material, número de agujeros, proveedor habitual…" },
  CIE: { nombre: "Cierre invisible", nota: "Si es separable, la marca, el proveedor habitual…" },
  HIL: { nombre: "Hilo poliéster", nota: "Cabos, metros por cono, proveedor habitual…" },
  ETI: { nombre: "Etiqueta tejida de marca", nota: "Qué dice y dónde va cosida…" },
  ELA: { nombre: "Elástico plano", nota: "Si es suave o firme, proveedor habitual…" },
  PRE: { nombre: "Pretina elasticada", nota: "Dónde se usa, proveedor habitual…" },
};

const NEUTRO_AVIO = { nombre: "Nombre del avío", nota: "Material, proveedor habitual…" };

/** El ejemplo de nombre y de nota de un avío, según la clase elegida. Sin clase todavía, un texto que no promete nada. */
export function sugerirAvio(prefijoDeLaClase: string | null, existentes: readonly { nombre: string }[]): { nombre: string; nota: string; origen: "tabla" | "neutro" } {
  const e = prefijoDeLaClase ? EJEMPLOS_AVIO[prefijoDeLaClase.toUpperCase()] : undefined;
  if (!e) return { ...NEUTRO_AVIO, origen: "neutro" };
  // Un ejemplo que ya está en el catálogo llevaría a un «ya existe»: ahí el nombre se vuelve neutro, igual que en una tela.
  const nombres = new Set(existentes.map((x) => clave(x.nombre)));
  return nombres.has(clave(e.nombre)) ? { nombre: NEUTRO_AVIO.nombre, nota: e.nota, origen: "neutro" } : { ...e, origen: "tabla" };
}

export function sugerirInsumo(tipo: TipoInsumo, existentes: readonly { codigo: string; nombre: string }[]): SugerenciaDeInsumo {
  const codigos = new Set(existentes.map((e) => clave(e.codigo)));
  const nombres = new Set(existentes.map((e) => clave(e.nombre)));
  const libre = EJEMPLOS[tipo].find((e) => !codigos.has(clave(e.codigo)) && !nombres.has(clave(e.nombre)));
  return libre ? { ...libre, nota: NOTA[tipo], origen: "tabla" } : { ...NEUTRO[tipo], nota: NOTA[tipo], origen: "neutro" };
}
