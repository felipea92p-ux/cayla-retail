import type { CampoDeGuia } from "./guia-campos";
import type { CompraDeTela, MaterialVista } from "./insumos-reglas";
import { camposDeLaTela, materialParaLaBase, problemasDeLaTela, type DatosDeLaTela } from "./tela-nueva-reglas";

// «Editar tela» (ADR-0554, actividad 3): corregir una tela que ya existe. Reglas puras, sin React ni red; la hoja y la guía de foco las comparten.
//
// CONTRATO
//   PROMETE: lo que se puede escribir de una tela al editarla se rechaza con EXACTAMENTE las reglas con que se creó (`problemasDeLaTela`): nadie corrige una tela hacia un estado que «Nueva tela» no habría dejado crear;
//            `payloadDeEditarTela` arma lo que `editar_material` espera (la merma como fracción, el ancho y el gramaje solo por kilo, los metros solo por rollo); sin cambios no hay nada que guardar.
//   ASUME:   el tipo y la unidad de una tela no se cambian (la base los ignora si llegan): aquí solo se editan nombre, tejido, composición, merma y cómo se compra. Editar es del líder (la base lo exige).
//   NO HACE: no decide quién puede guardar ni toca la base. Los colores no se editan aquí: siguen a su tela (el nombre, el tejido y la merma los copia la base).

/** Lo que la hoja muestra al abrir: lo que la tela ya dice, escrito como se escribe (la merma en porcentaje: 0,05 → «5»). */
export function datosDeLaTelaYaGuardada(m: MaterialVista): DatosDeLaTela {
  return {
    nombre: m.nombre,
    tejidoId: m.tejidoId ?? "",
    composicion: m.composicion ?? "",
    compra: (m.compra === "kilo" || m.compra === "rollo" ? m.compra : "metro") as CompraDeTela,
    ancho: m.ancho === null ? "" : String(m.ancho),
    gramaje: m.gramaje === null ? "" : String(m.gramaje),
    metrosPorRollo: m.metrosPorRollo === null ? "" : String(m.metrosPorRollo),
    merma: m.merma > 0 ? String(Math.round(m.merma * 10000) / 100) : "",
  };
}

/** Lo que se manda a `editar_material`: los mismos datos de la tela que `crear_material` (sin colores). */
export function payloadDeEditarTela(e: DatosDeLaTela): Record<string, unknown> {
  return materialParaLaBase(e);
}

/** ¿Lo escrito dice algo distinto de lo guardado? Se compara lo que viajaría a la base, así «5» y «5,00» o un espacio de más no cuentan como cambio. */
export function hayCambiosEnLaTela(inicial: DatosDeLaTela, actual: DatosDeLaTela): boolean {
  return JSON.stringify(materialParaLaBase(inicial)) !== JSON.stringify(materialParaLaBase(actual));
}

/** Lo que la hoja rechaza de lo escrito, en el orden en que lo dice. Vacío = se puede guardar. */
export function problemasDeEditarTela(e: DatosDeLaTela): string[] {
  return problemasDeLaTela(e);
}

/** Los campos de la guía de foco: los de la tela (tejido y composición se SUGIEREN, nunca bloquean) y quién lo anota. */
export function camposDeEditarTela(e: DatosDeLaTela & { responsableListo: boolean }): CampoDeGuia[] {
  return [...camposDeLaTela(e), { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota este cambio." }];
}
