import type { CampoDeGuia } from "./guia-campos";
import type { VocabularioDeTelas } from "./insumos-ficha-reglas";
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

/** Lo que se manda a `editar_material`: los mismos datos de la tela que `crear_material` (sin colores) y la VERSIÓN que la hoja leyó al abrirse. Sin ella, o con una vieja, la base no guarda: otra persona la pudo cambiar
 *  entretanto y no se pisa su cambio en silencio (ADR-0193). */
export function payloadDeEditarTela(e: DatosDeLaTela, version: string): Record<string, unknown> {
  return { ...materialParaLaBase(e), version };
}

/** Cuántos colores de la tela tienen un nombre distinto del que la base les escribiría hoy («Tela · Color», con el nombre VIVO del color en Catálogo ▸ Colores). Pasa cuando alguien renombra un color: el insumo no se entera
 *  hasta que se guarda su tela, y entonces guardarla —aunque no cambie nada— los pone al día. Un color que ya no está en la lista de colores no se compara: no se sabe cómo se llamaría. */
export function coloresConNombreDesfasado(
  tela: Pick<MaterialVista, "nombre">,
  colores: readonly { nombre: string; colorCodigo: string | null }[],
  vocabulario: Pick<VocabularioDeTelas, "colores">,
): number {
  let desfasados = 0;
  for (const c of colores) {
    const vivo = c.colorCodigo ? vocabulario.colores.find((x) => x.codigo === c.colorCodigo)?.nombre : undefined;
    if (c.colorCodigo && vivo === undefined) continue;
    if (c.nombre !== (vivo === undefined ? tela.nombre : `${tela.nombre} · ${vivo}`)) desfasados += 1;
  }
  return desfasados;
}

/** Lo que la hoja dice de los colores bajo los campos: a cuántos les llega el cambio (y por qué «su color» y no «sus 1 colores»). */
export function notaDeLosColores(cuantosColores: number): string {
  if (cuantosColores <= 0) return "El código de la tela no cambia, y el stock tampoco.";
  const a = cuantosColores === 1 ? "su color" : `sus ${cuantosColores} colores`;
  return `El nombre, el tejido y la merma que pongas aquí les llegan a ${a} al guardar. El código de la tela y el de cada color no cambian, y el stock tampoco.`;
}

/** Lo que conviene saber ANTES de guardar, según lo que se cambió. No bloquea nada: solo dice lo que el cambio NO hace. */
export function avisosDeEditarTela(inicial: DatosDeLaTela, actual: DatosDeLaTela): string[] {
  const antes = materialParaLaBase(inicial);
  const ahora = materialParaLaBase(actual);
  const avisos: string[] = [];
  if (ahora.nombre !== "" && antes.nombre !== ahora.nombre) {
    avisos.push("El nombre nuevo se verá en los colores, en las listas y en las órdenes que lo muestren; lo que ya imprimiste o enviaste no cambia.");
  }
  if (antes.merma_pct !== ahora.merma_pct) {
    avisos.push("La merma nueva cuenta para las órdenes que abras desde ahora; el plan de las que ya están abiertas no se recalcula solo.");
  }
  return avisos;
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
