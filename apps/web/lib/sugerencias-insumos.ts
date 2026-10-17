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

export function sugerirInsumo(tipo: TipoInsumo, existentes: readonly { codigo: string; nombre: string }[]): SugerenciaDeInsumo {
  const codigos = new Set(existentes.map((e) => clave(e.codigo)));
  const nombres = new Set(existentes.map((e) => clave(e.nombre)));
  const libre = EJEMPLOS[tipo].find((e) => !codigos.has(clave(e.codigo)) && !nombres.has(clave(e.nombre)));
  return libre ? { ...libre, nota: NOTA[tipo], origen: "tabla" } : { ...NEUTRO[tipo], nota: NOTA[tipo], origen: "neutro" };
}
