#!/usr/bin/env node
/**
 * Deriva — ¿producción corre la MISMA versión que `main`? La mitad que `verificar.mjs` no puede decir.
 *
 * EL PROBLEMA QUE RESUELVE. El SQL de producción se pega a mano y Vercel publica `main` al fusionar. Pasa en las dos
 * direcciones y nada lo avisaba:
 *   - SQL de `main` sin pegar: el 2026-09-27 se publicaron 6 cambios sin su SQL (el botón «Pedir» roto, el nº de
 *     operación de Yape perdido en silencio…).
 *   - Arreglos hechos directo en producción que `main` no tiene: se pierden la próxima vez que una migración recrea esa
 *     función desde el repo (le pasó a Análisis con el PR 397).
 * `verificar.mjs` responde «¿existe algo con ese nombre?»; con `create or replace` repetido no sabe CUÁL versión está
 * viva. Esto compara huellas del catálogo: cuerpo de cada función, permisos, políticas, disparadores, columnas,
 * candados, índices y vistas del schema `retail`.
 *
 * CÓMO SE USA
 *   1. Huellas de main: una base con todas las migraciones de main (el CI, o el Postgres desechable) y
 *        psql -At -f scripts/migraciones/deriva.sql > main.tsv
 *   2. Huellas de producción: la MISMA consulta en producción, solo lectura (el SQL Editor o el conector de Supabase), o
 *      `select retail.huellas_catalogo('<llave>')`. Se guarda la celda, o la respuesta JSON del conector, en un archivo.
 *   3. node scripts/migraciones/deriva.mjs main.tsv produccion.tsv [--markdown]
 *      Con `--resumen`, solo «hay o no hay diferencias», sin nombres ni cuentas: es lo que publica la revisión diaria
 *      (`deriva-diaria.yml`), porque el repo es público. Cada mañana GitHub pide las huellas de producción a
 *      `retail.huellas_catalogo` con su llave (20260928210000, ADR-0251). Desde el ADR-0402 la revisión diaria no le
 *      pasa las huellas de main a secas sino las de main MÁS el SQL que los PR abiertos declaran pegado
 *      (`deriva-pegados.mjs`), con `--con-pegados` para que la frase lo diga.
 *
 * QUÉ PROMETE. Lista, en palabras del negocio, lo que está en main y no en producción, lo que está en producción y no
 * en main, y lo que está en las dos con otra versión. Sale con código 1 si hay algo que no está en CONOCIDAS, y con 2 si
 * no pudo comparar (un archivo que falta, una celda vacía o mal formada): «no pude mirar» nunca se dice como «hay
 * diferencias» ni como «iguales».
 *
 * QUÉ NO PUEDE DECIR. De lo «distinto» no sabe cuál de las dos versiones es la nueva: eso se mira con
 * `pg_get_functiondef` en producción y `git log -S` en el repo. Tampoco mira datos (filas sembradas por una migración):
 * solo el catálogo. Y no ve Dynamic (`public`) ni las políticas de `storage`, que en este proyecto son de Dynamic.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Diferencias que se sabe que existen y no son SQL sin pegar ni arreglos perdidos. Cada una con su porqué: agregar una
 * aquí es decir «esto está bien así», no «esto molesta».
 */
export const CONOCIDAS = [
  {
    patron: /^(columna|candado|indice|permiso|rls|politica)\tgastos_legado_2026_09(\.|_|$)/,
    motivo: "La tabla vieja de gastos que Finanzas renombró (20260924235100) solo si tenía datos: existe en producción y no en una base nueva.",
  },
  {
    patron: /^fn\tregistrar_gasto_legado_2026_09\(/,
    motivo: "La función vieja de gastos, renombrada junto con su tabla por 20260924235100 solo en una base con datos.",
  },
  {
    patron: /^(columna|permiso|rls|vista)\tplanilla_por_sede\b/,
    motivo: "20260921160000 crea la vista solo si Dynamic tiene sus tablas de planilla; la base de main usa el stub de Dynamic, que no las tiene.",
  },
  {
    // Solo la forma de la tabla y el permiso de service_role: un permiso a anon, authenticated o PUBLIC, una política, un
    // disparador o una vista sobre un respaldo SÍ se ven, porque eso ya no es un respaldo quieto (ADR-0402).
    patron: /^(columna|candado|indice|rls)\trespaldo_[a-z0-9_]+(\.|$)|^permiso\trespaldo_[a-z0-9_]+\.service_role$/,
    motivo:
      "Tablas «respaldo_…» que deja en producción un arreglo de datos hecho allá (la renumeración de comprobantes de octubre): no vienen de una migración y no van al repo. Su lugar es el schema respaldo_purgas.",
  },
  {
    // Solo la forma de la tabla archivada de #1190 (columnas, candados e índices). Un permiso a anon/authenticated/PUBLIC, una
    // política o un disparador sobre ella SÍ se ven; su permiso de service_role y su RLS van congelados en la entrada de abajo.
    patron: /^(columna|candado|indice)\tcampana_disenos(\.|_|$)/,
    motivo:
      "La tabla campana_disenos de #1190 (ADR-0436), pegada en producción el 2026-10-17 y archivada por ADR-0476: vacía, sin políticas, no se borra. La migración 20261024155000 cerró #1190; su definición vive en la rama de #1190, no en main.",
  },
  {
    // CONGELADAS: si la entrada trae `huellas`, solo cubre las claves listadas y solo mientras la huella sea ESA. Así, un EXECUTE
    // que vuelve a abrirse sobre el editor archivado (re-pegar 20261017160000 o 231000) cambia la huella y sale en la revisión.
    patron: /^(fn\t(campana_diseno|campanas_lista|campanas_portada_dias|fn_campana_en_portada|fn_campana_para_disenar|fn_colores_de_portada_validos|fn_diseno_json|guardar_diseno_borrador|publicar_diseno_campana|volver_al_diseno_anterior)\()|^(rls\tcampana_disenos|permiso\tcampana_disenos\.service_role)$/,
    huellas: {
      "fn\tcampana_diseno(p_etiqueta_id uuid)": "4aaf6226ced7",
      "fn\tcampanas_lista()": "b46eaddfd677",
      "fn\tcampanas_portada_dias(p_desde date, p_hasta date)": "427e44f8c4bd",
      "fn\tfn_campana_en_portada(p_dia date)": "a6a99caadcea",
      "fn\tfn_campana_para_disenar(p_etiqueta_id uuid)": "85eab65236bb",
      "fn\tfn_colores_de_portada_validos(c jsonb)": "34d32ed7dd3b",
      "fn\tfn_diseno_json(d retail.campana_disenos)": "bdafd42d8326",
      "fn\tguardar_diseno_borrador(p_etiqueta_id uuid, p_diseno jsonb, p_version integer)": "a211970c4382",
      "fn\tpublicar_diseno_campana(p_etiqueta_id uuid, p_version integer)": "52f4e2a36941",
      "fn\tvolver_al_diseno_anterior(p_etiqueta_id uuid)": "2d93963b0a2a",
      "permiso\tcampana_disenos.service_role": "0aa2355c1753",
      "rls\tcampana_disenos": "b5a4aba65cef",
    },
    motivo:
      "Las 10 funciones de diseño de campaña de #1190 y el permiso de service_role de su tabla, archivadas sin borrar (ADR-0476 y la migración 20261024155000): ya nadie las llama, ni anon ni authenticated pueden ejecutarlas. Van CONGELADAS con su huella de después de archivar.",
  },
];

/**
 * El mismo objeto con otro NOMBRE en producción: se compara su contenido con el de main bajo el nombre de main. Va aquí y
 * no en CONOCIDAS porque una conocida no se compara nunca: si el candado de IGV de `gastos` cambiara en main y no se
 * pegara, no aparecería. `[nombre en producción, nombre en main]`.
 */
export const ALIAS_PRODUCCION = new Map([
  // Cuando 20260924235100 renombró la tabla vieja de gastos, la nueva tomó los nombres de candado con sufijo 1.
  ["candado\tgastos.gastos_igv_check1", "candado\tgastos.gastos_igv_check"],
  ["candado\tgastos.gastos_ubicacion_id_fkey1", "candado\tgastos.gastos_ubicacion_id_fkey"],
]);

/** Producción con los nombres de main (solo si main no tiene ya un objeto con el nombre de producción). */
export function conNombresDeMain(produccion, main, alias) {
  const r = new Map();
  for (const [clave, huella] of produccion) {
    const enMain = alias.get(clave);
    r.set(enMain && !main.has(clave) && !produccion.has(enMain) ? enMain : clave, huella);
  }
  return r;
}

/** Lee una celda de huellas: la salida de psql, o la respuesta JSON del MCP de Supabase guardada tal cual. */
export function leerHuellas(texto) {
  let celda = texto.trim();
  if (celda.startsWith("{") || celda.startsWith("[")) {
    const buscar = (valor) => {
      if (typeof valor === "string") {
        const m = valor.match(/\[\{[\s\S]*\}\]/);
        return m ? buscar(JSON.parse(m[0])) : null;
      }
      if (Array.isArray(valor)) return valor.length ? buscar(valor[0]) : null;
      if (valor && typeof valor === "object") {
        if (typeof valor.huellas === "string") return valor.huellas;
        for (const v of Object.values(valor)) {
          const r = buscar(v);
          if (r) return r;
        }
      }
      return null;
    };
    celda = buscar(JSON.parse(celda)) ?? "";
  }
  const huellas = new Map();
  for (const linea of celda.split("\n")) {
    if (!linea.trim()) continue;
    const [g, k, h] = linea.split("\t");
    if (!g || !k || !h) throw new Error(`Línea de huellas mal formada: ${linea.slice(0, 120)}`);
    huellas.set(`${g}\t${k}`, h);
  }
  // Una base con retail tiene miles de objetos: una celda vacía es una respuesta rota, no «producción no tiene nada».
  if (huellas.size === 0) throw new Error("La celda de huellas está vacía.");
  return huellas;
}

/** Compara las huellas. Devuelve `{ soloMain, soloProduccion, distintas, conocidas }`, cada una con `{ g, k, motivo? }`. */
export function compararHuellas(main, deProduccion, conocidas = CONOCIDAS, alias = ALIAS_PRODUCCION) {
  const r = { soloMain: [], soloProduccion: [], distintas: [], conocidas: [] };
  const produccion = conNombresDeMain(deProduccion, main, alias);
  const claves = [...new Set([...main.keys(), ...produccion.keys()])].sort();
  for (const clave of claves) {
    const enMain = main.get(clave);
    const enProd = produccion.get(clave);
    if (enMain === enProd) continue;
    const [g, k] = clave.split("\t");
    // Una entrada con `huellas` está CONGELADA: solo cubre las claves que lista y solo con esa huella exacta.
    const conocida = conocidas.find((c) => c.patron.test(clave) && (!c.huellas || (clave in c.huellas && c.huellas[clave] === enProd)));
    if (conocida) {
      r.conocidas.push({ g, k, motivo: conocida.motivo });
      continue;
    }
    if (enProd === undefined) r.soloMain.push({ g, k });
    else if (enMain === undefined) r.soloProduccion.push({ g, k });
    else r.distintas.push({ g, k });
  }
  return r;
}

const GRUPO = {
  fn: "función",
  politica: "política",
  disparador: "disparador",
  permiso: "permiso de tabla",
  rls: "RLS",
  permiso_columna: "permiso de columna",
  schema: "permiso del schema",
  columna: "columna",
  candado: "candado",
  indice: "índice",
  vista: "vista",
};

/** El informe en palabras del negocio (texto para la terminal, o Markdown para un issue). */
export function informe(r, { markdown = false } = {}) {
  const t = (s) => (markdown ? `### ${s}` : `\n${s}`);
  const item = ({ g, k }) => (markdown ? `- ${GRUPO[g] ?? g} \`${k}\`` : `  - ${GRUPO[g] ?? g} ${k}`);
  const partes = [];
  const total = r.soloMain.length + r.soloProduccion.length + r.distintas.length;
  partes.push(
    total === 0
      ? "✓ Producción corre lo mismo que main (fuera de las diferencias conocidas)."
      : `✗ ${total} diferencia${total === 1 ? "" : "s"} entre producción y main.`,
  );
  if (r.soloMain.length) {
    partes.push(t(`Está en main y NO en producción: SQL sin pegar (${r.soloMain.length})`));
    partes.push(...r.soloMain.map(item));
  }
  if (r.soloProduccion.length) {
    partes.push(t(`Está en producción y NO en main: arreglo en vivo que main perdería (${r.soloProduccion.length})`));
    partes.push(...r.soloProduccion.map(item));
  }
  if (r.distintas.length) {
    partes.push(t(`Está en los dos con otra versión: una de las dos está vieja (${r.distintas.length})`));
    partes.push(...r.distintas.map(item));
  }
  if (r.conocidas.length) {
    partes.push(t(`Diferencias conocidas, que están bien así (${r.conocidas.length})`));
    const porMotivo = new Map();
    for (const c of r.conocidas) porMotivo.set(c.motivo, (porMotivo.get(c.motivo) ?? 0) + 1);
    for (const [motivo, n] of porMotivo) partes.push(markdown ? `- ${n} × ${motivo}` : `  - ${n} × ${motivo}`);
  }
  return partes.join("\n");
}

/**
 * Solo «hay o no hay diferencias», sin nombres ni cuentas: para lo que se publica (el registro de GitHub Actions y los
 * avisos de un repo PÚBLICO). Con nombres, un aviso de «este revoke de main todavía no está en producción» le diría a
 * cualquiera qué puerta sigue abierta. Y las cuentas también lo dicen: «5 de main sin pegar» el día que se fusiona un PR
 * cuyas migraciones públicas crean 5 funciones (pasó el 2026-09-28 con Frescura) nombra el SQL que falta sin nombrarlo.
 * El sí/no ya es público (la corrida sale roja o verde). Los nombres y las cuentas se miran en privado: la consulta en el
 * SQL Editor (o el conector de Supabase) y `deriva.mjs` sin `--resumen`.
 * Con `conPegados` (`--con-pegados`), la revisión diaria comparó con main MÁS el SQL que los PR abiertos declaran pegado
 * (`deriva-pegados.mjs`, ADR-0402), y la frase lo dice.
 */
export function resumen(r, { conPegados = false } = {}) {
  const total = r.soloMain.length + r.soloProduccion.length + r.distintas.length;
  if (conPegados) {
    return total === 0
      ? "✓ Producción corre main más lo que los PR abiertos declaran pegado (fuera de las diferencias conocidas)."
      : "✗ Producción no corre main más lo que los PR abiertos declaran pegado: tiene algo que nadie declara, o le falta algo declarado.";
  }
  if (total === 0) return "✓ Producción corre lo mismo que main (fuera de las diferencias conocidas).";
  return "✗ Producción y main no corren lo mismo.";
}

/**
 * Sale con 0 si son iguales, 1 si hay diferencias y 2 si no pudo comparar (uso incorrecto, un archivo que no está, una
 * celda vacía o mal formada). `deriva-diaria.yml` toma el 2 como «hoy no se pudo comparar», nunca como diferencias: sin
 * el `catch`, Node sale con 1 ante cualquier error y el aviso diría «hay diferencias» con la línea vacía.
 */
function main() {
  const [rutaMain, rutaProd, ...opciones] = process.argv.slice(2);
  if (!rutaMain || !rutaProd) {
    console.error("Uso: node scripts/migraciones/deriva.mjs <huellas-main> <huellas-produccion> [--markdown | --resumen [--con-pegados]]");
    process.exit(2);
  }
  const publico = opciones.includes("--resumen");
  let r;
  try {
    r = compararHuellas(leerHuellas(readFileSync(rutaMain, "utf8")), leerHuellas(readFileSync(rutaProd, "utf8")));
  } catch (e) {
    // Con --resumen el registro es público, y el motivo puede traer un pedazo de la respuesta de producción.
    console.error(publico ? "✗ No se pudo comparar: una de las celdas de huellas no se pudo leer." : `✗ No se pudo comparar: ${e.message}`);
    process.exit(2);
  }
  console.log(publico ? resumen(r, { conPegados: opciones.includes("--con-pegados") }) : informe(r, { markdown: opciones.includes("--markdown") }));
  if (r.soloMain.length + r.soloProduccion.length + r.distintas.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
