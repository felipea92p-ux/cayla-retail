#!/usr/bin/env node
/**
 * Tienda web ▸ Campañas, actividad 1 (el módulo, el diseño de cada campaña y la lista) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261021161000_campanas_web_modulo_y_lista.sql`:
 *   1. Permisos: el módulo `campanas_web` nace sin rol (solo el líder lo ve); sin él no se lee la lista; con él en un rol, la integrante
 *      la lee. La tabla no la lee ni la escribe nadie directo y la función es de las cuentas del ERP (ni un visitante ni la tienda).
 *   2. La lista (`fn_campanas_web`): solo campañas (no «urgencia»), aprobadas, activas y con descuento; el estado se mide con la
 *      fecha de Lima (vivo / por empezar / terminada) y las terminadas hace más de 120 días no salen; el orden es vivas, por empezar,
 *      terminadas; cuenta los MODELOS que toca la campaña (a mano o por categoría), sin repetir; sin fila de diseño, `diseno` es null.
 *   3. El diseño: lo que la base acepta y lo que no (ambiente sin plantilla, imagen sin imagen, un ambiente fuera del catálogo, un
 *      efecto desconocido, un texto largo, un color que no es #rrggbb, una vertical sin horizontal, una ruta fuera de `campanas/`).
 *      Una campaña con diseño lo muestra en la lista y el diseño se va con su campaña.
 *   4. Guardar (`guardar_campana_diseno`): pide el módulo y firma con el responsable; crea con valores de fábrica y cambia con un parche
 *      (lo que no se manda no se pisa); la versión frena a la segunda persona; sin cambios no escribe ni anota; solo lo que la base
 *      acepta (una llave rara, un ambiente fuera del catálogo, un dato con forma torcida); una campaña terminada o que no es campaña no se
 *      diseña; no toca el estado; y cada cambio deja su línea en la Actividad. `fn_campana_diseno` lee una campaña con su diseño.
 *   5. La migración se puede volver a correr sin duplicar nada.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK, como Felipe (líder) o Micaela (integrante de Trujillo): nunca se
 * commitea nada en el Postgres local que comparten los worktrees.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261021161000_campanas_web_modulo_y_lista.sql` mete la migración dentro de
 * cada transacción. Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * DA POR SENTADO: el seed (Felipe líder, Micaela integrante, «Blusa Emma» y «Falda Renata» con varias tallas).
 *
 * USO
 *   pnpm pruebas:campanas-web    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:campanas-web -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261021161000_campanas_web_modulo_y_lista.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante, fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}
function esperarValor(nombre, r, esperado) {
  esperar(nombre, r.ok && r.salida === esperado, r.ok ? `dio «${r.salida}», se esperaba «${esperado}»` : r.mensaje);
}
function esperarError(nombre, r, contiene) {
  esperar(nombre, !r.ok && r.mensaje.includes(contiene), r.ok ? `no falló: ${r.salida}` : `falló distinto: ${r.mensaje}`);
}

// ---- El punto de partida de cada escenario: sin campañas, y como Felipe ----
const PREPARAR = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
update retail.etiquetas set activo = false where activo and descuento_pct is not null;
select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
select id as falda from retail.productos where referencia = 'Falda Renata' \\gset
select categoria_id as cat_falda from retail.productos where id = :'falda' \\gset
select retail.fn_hoy_lima() as hoy \\gset
`;
const EN_LA_BASE = `begin;\n${APLICAR_ANTES}\n`;
const COMO_MICAELA = `set local request.jwt.claim.sub = '${MICAELA}';\n`;
const MODULO_A_INTEGRANTE = `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'campanas_web');\n`;
const COMO_TIENDA = `grant tienda_web to current_user with set true;\nset local role tienda_web;\n`;

/** Una campaña de prueba a nombre de Felipe (la base aprueba sola la etiqueta de un líder). Deja :etq. */
const campana = (nombre, pct, { estilo = "campana", desde = "null", hasta = "null", activo = true } = {}) => {
  const fecha = (x) => (x === "null" ? "null" : `(:'hoy'::date + ${x})`);
  return `insert into retail.etiquetas (nombre, estilo, activo, descuento_pct, vigente_desde, vigente_hasta)
  values ('${nombre}', '${estilo}', ${activo}, ${pct}, ${fecha(desde)}, ${fecha(hasta)}) returning id as etq \\gset\n`;
};
const aTodasLasTallas = (prod) =>
  `insert into retail.variante_etiquetas (variante_id, etiqueta_id) select v.id, :'etq' from retail.variantes v where v.producto_id = :'${prod}' and v.activo;\n`;
const LISTA = `retail.fn_campanas_web() -> 'campanas'`;
const ACTIVIDAD = `(select count(*) from retail.actividad where modulo = 'campanas_web')`;
/** Guardar un parche de diseño (`version`: «null» o una expresión SQL). Sobre la campaña `:etq`. */
const guardar = (parche, version = "null", etq = "etq") => `select retail.guardar_campana_diseno(:'${etq}', ${version}, '${parche}'::jsonb)`;
const VERSION = `(select version from retail.campana_web_disenos where etiqueta_id = :'etq')`;
const AMBIENTE = `{"modo":"ambiente","plantilla":"aniversario"}`;
/** Un diseño válido de ambiente para la campaña `:etq`, con los cambios que se pasen. */
const diseno = (extra = "") =>
  `insert into retail.campana_web_disenos (etiqueta_id, modo, plantilla${extra ? ", " + extra.split("=")[0] : ""}) values (:'etq', 'ambiente', 'aniversario'${extra ? ", " + extra.split("=")[1] : ""});\n`;

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select to_regprocedure('retail.fn_campanas_web()') is not null;");
    if (hay.salida !== "t") {
      console.error(`Faltan las campañas web: aplica ${MIGRACION} o corre con APLICAR_ANTES=${MIGRACION}`);
      process.exit(2);
    }
  }

  // ---------------------------------------------------------------- 1. Permisos
  console.log("— Permisos —");
  esperarValor(
    "el módulo nace sin rol: el líder lo ve, la integrante no, y nadie lo tiene en un rol",
    correr(`${PREPARAR}select concat_ws('|', retail.fn_ve_modulo('campanas_web'),
        (select count(*) from retail.rol_modulos where modulo = 'campanas_web'),
        (select grupo || '·' || orden || '·' || delegable from retail.modulos where clave = 'campanas_web'));
      ${COMO_MICAELA}select retail.fn_ve_modulo('campanas_web');
      rollback;`),
    "t|0|Tienda web·67·true\nf",
  );
  esperarError(
    "sin el módulo no se lee la lista",
    correr(`${PREPARAR}${COMO_MICAELA}select ${LISTA};\nrollback;`),
    "campanas_web_sin_modulo",
  );
  esperarValor(
    "con el módulo en su rol, la integrante la lee",
    correr(`${PREPARAR}${MODULO_A_INTEGRANTE}${campana("ZZ Camp", 10, { hasta: "5" })}${COMO_MICAELA}
      select jsonb_array_length(${LISTA});
      rollback;`),
    "1",
  );
  esperarValor(
    "nadie lee ni escribe la tabla directo (ni el ERP, ni un visitante, ni la tienda)",
    correr(`${EN_LA_BASE}select concat_ws('|', has_table_privilege('authenticated', 'retail.campana_web_disenos', 'SELECT'),
        has_table_privilege('anon', 'retail.campana_web_disenos', 'SELECT'), has_table_privilege('tienda_web', 'retail.campana_web_disenos', 'SELECT'),
        has_table_privilege('authenticated', 'retail.campana_web_disenos', 'INSERT, UPDATE, DELETE'),
        (select relrowsecurity from pg_class where oid = 'retail.campana_web_disenos'::regclass),
        (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'campana_web_disenos'));\nrollback;`),
    "f|f|f|f|t|0",
  );
  esperarValor(
    "la lista es de las cuentas del ERP: ni un visitante ni la tienda la llaman",
    correr(`${EN_LA_BASE}select concat_ws('|', has_function_privilege('anon', 'retail.fn_campanas_web()', 'EXECUTE'),
        has_function_privilege('tienda_web', 'retail.fn_campanas_web()', 'EXECUTE'),
        has_function_privilege('authenticated', 'retail.fn_campanas_web()', 'EXECUTE'));\nrollback;`),
    "f|f|t",
  );
  esperarValor(
    "las funciones del editor también son de las cuentas del ERP; las piezas internas, de nadie",
    correr(`${EN_LA_BASE}select concat_ws('|',
        bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')), bool_or(has_function_privilege('tienda_web', p.oid, 'EXECUTE')),
        bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')), count(*))
      from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_campana_diseno', 'guardar_campana_diseno');
      select concat_ws('|', bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')), count(*))
      from pg_proc p where p.pronamespace = 'retail'::regnamespace
        and p.proname in ('fn_campana_web_anotar', 'fn_campana_web_valida', 'fn_campana_diseno_json', 'fn_campana_web_fila');\nrollback;`),
    "f|f|t|2\nf|4",
  );
  esperarError(
    "la tienda no puede llamar la lista aunque lo intente",
    correr(`${EN_LA_BASE}${COMO_TIENDA}select retail.fn_campanas_web();\nrollback;`),
    "permission denied",
  );

  // ---------------------------------------------------------------- 2. La lista
  console.log("\n— La lista —");
  esperarValor(
    "sin campañas, la lista está vacía",
    correr(`${PREPARAR}select jsonb_array_length(${LISTA});\nrollback;`),
    "0",
  );
  esperarValor(
    "solo entran las campañas aprobadas, activas y con descuento (no «urgencia», ni inactivas, ni sin %)",
    correr(`${PREPARAR}${campana("ZZ Buena", 20, { hasta: "5" })}${campana("ZZ Urgencia", 20, { estilo: "urgencia", hasta: "5" })}${campana("ZZ Inactiva", 20, { hasta: "5", activo: false })}${campana("ZZ SinPct", "null", { hasta: "5" })}
      select string_agg(c ->> 'nombre', ',') from jsonb_array_elements(${LISTA}) c;
      rollback;`),
    "ZZ Buena",
  );
  esperarValor(
    "el estado sale de la fecha de Lima: vivo, por empezar y terminada; y el orden es vivas, por empezar, terminadas",
    correr(`${PREPARAR}${campana("ZZ Termino", 15, { desde: "-30", hasta: "-10" })}${campana("ZZ Empieza", 25, { desde: "10", hasta: "17" })}${campana("ZZ Hoy", 20, { desde: "-3", hasta: "5" })}${campana("ZZ SinFin", 5, { desde: "-1" })}
      select string_agg((c ->> 'nombre') || ':' || (c ->> 'estado'), ',') from jsonb_array_elements(${LISTA}) c;
      rollback;`),
    "ZZ Hoy:vivo,ZZ SinFin:vivo,ZZ Empieza:prog,ZZ Termino:fin",
  );
  esperarValor(
    "una campaña que terminó hace más de 120 días ya no sale; una de hace 119 sí",
    correr(`${PREPARAR}${campana("ZZ Vieja", 15, { desde: "-300", hasta: "-121" })}${campana("ZZ Reciente", 15, { desde: "-300", hasta: "-119" })}
      select string_agg(c ->> 'nombre', ',') from jsonb_array_elements(${LISTA}) c;
      rollback;`),
    "ZZ Reciente",
  );
  esperarValor(
    "cuenta modelos (no tallas): una prenda a mano con todas sus tallas es 1; sumar su categoría y otra prenda sin repetir",
    correr(`${PREPARAR}${campana("ZZ Modelos", 20, { hasta: "5" })}${aTodasLasTallas("emma")}
      select (select (c ->> 'prendas') from jsonb_array_elements(${LISTA}) c);
      insert into retail.etiqueta_categorias (etiqueta_id, categoria_id) values (:'etq', :'cat_falda');
      select (select (c ->> 'prendas')::int >= 2 from jsonb_array_elements(${LISTA}) c);
      rollback;`),
    "1\nt",
  );
  esperarValor(
    "una campaña sin diseño trae diseno null; el descuento y la vigencia son los de Etiquetas",
    correr(`${PREPARAR}${campana("ZZ SinDiseno", 20, { desde: "-1", hasta: "5" })}
      select concat_ws('|', coalesce((c -> 'diseno')::text, 'null'), c ->> 'pct', c ->> 'hasta' = (:'hoy'::date + 5)::text)
        from jsonb_array_elements(${LISTA}) c;
      rollback;`),
    "null|20.00|t",
  );

  // ---------------------------------------------------------------- 3. El diseño
  console.log("\n— El diseño —");
  esperarValor(
    "un diseño de ambiente se guarda con los valores de fábrica y la lista lo muestra",
    correr(`${PREPARAR}${campana("ZZ ConDiseno", 20, { hasta: "5" })}${diseno()}
      select concat_ws('|', c #>> '{diseno,modo}', c #>> '{diseno,plantilla}', c #>> '{diseno,estado}', c #>> '{diseno,version}')
        from jsonb_array_elements(${LISTA}) c;
      select concat_ws('|', paleta, franja, entrada, efecto, intensidad, duracion, cuenta, donde_franja, donde_portada, donde_catalogo, donde_sello, donde_bolsa)
        from retail.campana_web_disenos where etiqueta_id = :'etq';
      rollback;`),
    "ambiente|aniversario|borrador|1\n0|rota|telon|ninguno|poca|una|siempre|t|t|t|t|t",
  );
  esperarValor(
    "un diseño de imagen lleva su horizontal y, si quiere, su vertical",
    correr(`${PREPARAR}${campana("ZZ Imagen", 25, { hasta: "5" })}
      insert into retail.campana_web_disenos (etiqueta_id, modo, imagen_ruta, imagen_vertical_ruta, acento)
      values (:'etq', 'imagen', 'campanas/x/h.webp', 'campanas/x/v.webp', '#9e1d32');
      select concat_ws('|', c #>> '{diseno,modo}', c #>> '{diseno,plantilla}', c #>> '{diseno,imagen_ruta}') from jsonb_array_elements(${LISTA}) c;
      rollback;`),
    "imagen|campanas/x/h.webp",
  );
  const malo = (nombre, columnas, valores, que) =>
    esperarError(
      nombre,
      correr(`${PREPARAR}${campana("ZZ Malo", 20, { hasta: "5" })}
        insert into retail.campana_web_disenos (etiqueta_id, ${columnas}) values (:'etq', ${valores});
        rollback;`),
      que,
    );
  malo("un ambiente sin plantilla no entra", "modo", "'ambiente'", "campana_web_disenos_modo_coherente");
  malo("una plantilla con modo imagen no entra", "modo, plantilla, imagen_ruta", "'imagen', 'cyber', 'campanas/x/h.webp'", "campana_web_disenos_modo_coherente");
  malo("una imagen sin su horizontal no entra", "modo", "'imagen'", "campana_web_disenos_modo_coherente");
  malo("un ambiente fuera del catálogo no entra", "modo, plantilla", "'ambiente', 'halloween'", "campana_web_disenos_plantilla");
  malo("un efecto que la tienda no conoce no entra", "modo, plantilla, efecto", "'ambiente', 'cyber', 'fuegos'", "campana_web_disenos_efecto");
  malo("un movimiento fuera de la lista no entra", "modo, plantilla, entrada", "'ambiente', 'cyber', 'vuela'", "campana_web_disenos_entrada");
  malo("una paleta que no existe no entra", "modo, plantilla, paleta", "'ambiente', 'cyber', 3", "campana_web_disenos_paleta");
  malo("un titular de 29 letras no entra", "modo, plantilla, titular", `'ambiente', 'cyber', '${"a".repeat(29)}'`, "campana_web_disenos_titular");
  malo("un botón de 23 letras no entra", "modo, plantilla, boton", `'ambiente', 'cyber', '${"a".repeat(23)}'`, "campana_web_disenos_boton");
  malo("un color que no es #rrggbb no entra", "modo, plantilla, acento", "'ambiente', 'cyber', 'rojo'", "campana_web_disenos_acento");
  malo("una vertical sin horizontal no entra", "modo, plantilla, imagen_vertical_ruta", "'ambiente', 'cyber', 'campanas/x/v.webp'", "campana_web_disenos_imagen_vertical");
  malo("una ruta fuera de «campanas/» no entra", "modo, imagen_ruta", "'imagen', '../otra/h.webp'", "campana_web_disenos_imagen_ruta");
  malo("un estado que no es borrador ni programado no entra", "modo, plantilla, estado", "'ambiente', 'cyber', 'publicado'", "campana_web_disenos_estado");
  esperarError(
    "una campaña solo tiene un diseño",
    correr(`${PREPARAR}${campana("ZZ Doble", 20, { hasta: "5" })}${diseno()}${diseno()}rollback;`),
    "campana_web_disenos_pkey",
  );
  esperarValor(
    "el diseño se va con su campaña (es configuración, no historia)",
    correr(`${PREPARAR}${campana("ZZ Se va", 20, { hasta: "5" })}${diseno()}
      delete from retail.etiquetas where id = :'etq';
      select count(*) from retail.campana_web_disenos where etiqueta_id = :'etq';
      rollback;`),
    "0",
  );

  // ---------------------------------------------------------------- 4. Guardar
  console.log("\n— Guardar el diseño —");
  for (const [que, sql] of [
    ["leer una campaña", `select retail.fn_campana_diseno(:'etq');`],
    ["guardar su diseño", `${guardar(AMBIENTE)};`],
  ]) {
    esperarError(`sin el módulo no se puede ${que}`, correr(`${PREPARAR}${campana("ZZ G", 20, { hasta: "5" })}${COMO_MICAELA}${sql}\nrollback;`), "campanas_web_sin_modulo");
  }
  esperarValor(
    "una campaña sin diseño se lee con diseno null, su descuento y la fecha de hoy",
    correr(`${PREPARAR}${campana("ZZ Lee", 20, { hasta: "5" })}
      select concat_ws('|', coalesce((d -> 'diseno')::text, 'null'), d #>> '{campana,nombre}', d #>> '{campana,estado}', d #>> '{campana,pct}',
          (d ->> 'hoy') = :'hoy', (d -> 'campana') ? 'diseno')
        from (select retail.fn_campana_diseno(:'etq') d) x;
      rollback;`),
    "null|ZZ Lee|vivo|20.00|t|f",
  );
  esperarValor(
    "la primera vez crea el diseño con los valores de fábrica, en borrador y versión 1",
    correr(`${PREPARAR}${campana("ZZ Crea", 20, { hasta: "5" })}${guardar(AMBIENTE)} \\gset
      select concat_ws('|', modo, plantilla, paleta, franja, entrada, efecto, estado, version, donde_franja, donde_bolsa)
        from retail.campana_web_disenos where etiqueta_id = :'etq';
      rollback;`),
    "ambiente|aniversario|0|rota|telon|ninguno|borrador|1|t|t",
  );
  esperarValor(
    "guardar devuelve el diseño completo con «donde» anidado, y la lista y el editor lo ven",
    correr(`${PREPARAR}${campana("ZZ Devuelve", 20, { hasta: "5" })}
      select concat_ws('|', r ->> 'plantilla', r ->> 'version', r #>> '{donde,sello}', (select string_agg(k, ',' order by k) from jsonb_object_keys(r) k))
        from (${guardar('{"modo":"ambiente","plantilla":"cyber","paleta":2,"acento":"#00aa55","efecto":"copos"}')} r) x;
      select concat_ws('|', c #>> '{diseno,plantilla}', c #>> '{diseno,estado}') from jsonb_array_elements(${LISTA}) c;
      select concat_ws('|', d #>> '{diseno,paleta}', d #>> '{diseno,acento}', d #>> '{diseno,efecto}') from (select retail.fn_campana_diseno(:'etq') d) x;
      rollback;`),
    "cyber|1|true|acento,actualizado_en,bajada,boton,cuenta,donde,duracion,efecto,entrada,estado,franja,imagen_ruta,imagen_vertical_ruta,intensidad,modo,paleta,plantilla,titular,version\ncyber|borrador\n2|#00aa55|copos",
  );
  esperarValor(
    "firma el responsable: una integrante con el módulo guarda y firma ella",
    correr(`${PREPARAR}${MODULO_A_INTEGRANTE}${campana("ZZ Firma", 20, { hasta: "5" })}${COMO_MICAELA}${guardar(AMBIENTE)} \\gset
      select (select p.nombres from public.personas p where p.id = d.actualizado_por) || '|' || (select p.nombres from public.personas p where p.id = d.creado_por)
        from retail.campana_web_disenos d where d.etiqueta_id = :'etq';
      rollback;`),
    "Micaela|Micaela",
  );
  esperarValor(
    "un parche solo cambia lo que trae: lo demás no se pisa, y cada cambio sube la versión",
    correr(`${PREPARAR}${campana("ZZ Parche", 20, { hasta: "5" })}${guardar('{"modo":"ambiente","plantilla":"navidad","paleta":1,"titular":"Hola"}')} \\gset
      ${guardar('{"efecto":"copos","donde_sello":false}', VERSION)} \\gset
      select concat_ws('|', plantilla, paleta, titular, efecto, donde_sello, donde_bolsa, version) from retail.campana_web_disenos where etiqueta_id = :'etq';
      rollback;`),
    "navidad|1|Hola|copos|f|t|2",
  );
  esperarValor(
    "poner un dato en null lo borra (el titular), y se puede pasar de ambiente a imagen en un solo guardado",
    correr(`${PREPARAR}${campana("ZZ Modo", 20, { hasta: "5" })}${guardar('{"modo":"ambiente","plantilla":"navidad","titular":"Hola"}')} \\gset
      ${guardar('{"titular":null}', VERSION)} \\gset
      select coalesce(titular, 'sin titular') from retail.campana_web_disenos where etiqueta_id = :'etq';
      ${guardar('{"modo":"imagen","plantilla":null,"imagen_ruta":"campanas/x/h.webp"}', VERSION)} \\gset
      select concat_ws('|', modo, coalesce(plantilla, 'sin'), imagen_ruta, version) from retail.campana_web_disenos where etiqueta_id = :'etq';
      rollback;`),
    "sin titular\nimagen|sin|campanas/x/h.webp|3",
  );
  esperarValor(
    "sin cambios no escribe ni anota: la versión, la fecha y la Actividad se quedan",
    correr(`${PREPARAR}${campana("ZZ Igual", 20, { hasta: "5" })}${guardar('{"modo":"ambiente","plantilla":"gato","paleta":2}')} \\gset
      select ${ACTIVIDAD} as antes, version as v0, actualizado_en as t0 from retail.campana_web_disenos where etiqueta_id = :'etq' \\gset
      ${guardar('{"paleta":2,"plantilla":"gato"}', VERSION)} \\gset
      select concat_ws('|', ${ACTIVIDAD} = :antes, version = :v0, actualizado_en = :'t0') from retail.campana_web_disenos where etiqueta_id = :'etq';
      rollback;`),
    "t|t|t",
  );
  esperarError(
    "la segunda persona con la campaña abierta recibe «cambio_otro» (versión vieja)",
    correr(`${PREPARAR}${campana("ZZ Carrera", 20, { hasta: "5" })}${guardar(AMBIENTE)} \\gset
      ${guardar('{"paleta":1}', VERSION)} \\gset
      ${guardar('{"paleta":2}', "1")};
      rollback;`),
    "campana_cambio_otro",
  );
  esperarError(
    "crear con una versión (otra persona la había borrado o nunca existió) también es «cambio_otro»",
    correr(`${PREPARAR}${campana("ZZ V", 20, { hasta: "5" })}${guardar(AMBIENTE, "1")};\nrollback;`),
    "campana_cambio_otro",
  );
  esperarError(
    "y guardar sin versión sobre un diseño que ya existe también",
    correr(`${PREPARAR}${campana("ZZ V2", 20, { hasta: "5" })}${guardar(AMBIENTE)} \\gset
      ${guardar('{"paleta":1}')};
      rollback;`),
    "campana_cambio_otro",
  );
  esperarError(
    "una campaña terminada ya no se rediseña",
    correr(`${PREPARAR}${campana("ZZ Fin", 20, { desde: "-30", hasta: "-1" })}${guardar(AMBIENTE)};\nrollback;`),
    "campana_terminada",
  );
  esperarError(
    "una etiqueta que no es campaña (urgencia) no se diseña",
    correr(`${PREPARAR}${campana("ZZ Urg", 20, { estilo: "urgencia", hasta: "5" })}${guardar(AMBIENTE)};\nrollback;`),
    "campana_no_existe",
  );
  esperarError(
    "un id que no existe no se diseña ni se lee",
    correr(`${PREPARAR}select retail.fn_campana_diseno(gen_random_uuid());\nrollback;`),
    "campana_no_existe",
  );
  const rechaza = (nombre, parche, contiene = "campana_diseno_datos_invalidos") =>
    esperarError(nombre, correr(`${PREPARAR}${campana("ZZ R", 20, { hasta: "5" })}${guardar(parche)};\nrollback;`), contiene);
  rechaza("una llave que no es del diseño se rechaza (no se pierde en silencio)", '{"modo":"ambiente","plantilla":"cyber","color":"rojo"}');
  rechaza("no se puede tocar el estado desde aquí (programar es de otra función)", '{"modo":"ambiente","plantilla":"cyber","estado":"programado"}');
  rechaza("ni la versión", '{"modo":"ambiente","plantilla":"cyber","version":9}');
  rechaza("un ambiente fuera del catálogo se rechaza y dice cuál regla", '{"modo":"ambiente","plantilla":"halloween"}', "campana_web_disenos_plantilla");
  rechaza("una paleta que no existe se rechaza", '{"modo":"ambiente","plantilla":"cyber","paleta":3}', "campana_web_disenos_paleta");
  rechaza("un color que no es #rrggbb se rechaza", '{"modo":"ambiente","plantilla":"cyber","acento":"rojo"}', "campana_web_disenos_acento");
  rechaza("un dato con forma torcida («paleta»: texto) se rechaza", '{"modo":"ambiente","plantilla":"cyber","paleta":"x"}');
  rechaza("el diseño que no es un objeto se rechaza", '[1]');
  rechaza("un ambiente sin plantilla se rechaza", '{"modo":"ambiente"}', "campana_web_disenos_modo_coherente");
  esperarValor(
    "tras un rechazo no queda nada escrito",
    correr(`${PREPARAR}${campana("ZZ Nada", 20, { hasta: "5" })}
      select ${ACTIVIDAD} as a0 \\gset
      do $$ begin perform retail.guardar_campana_diseno((select id from retail.etiquetas where nombre = 'ZZ Nada'), null, '{"modo":"ambiente","plantilla":"halloween"}'::jsonb); exception when others then null; end $$;
      select (select count(*) from retail.campana_web_disenos where etiqueta_id = :'etq') || '|' || (${ACTIVIDAD} = :a0);
      rollback;`),
    "0|true",
  );
  esperarValor(
    "cada cambio deja su línea en la Actividad, con quién lo hizo; sin cambios, ninguna",
    correr(`${PREPARAR}${campana("ZZ Act", 20, { hasta: "5" })}${guardar(AMBIENTE)} \\gset
      ${guardar('{"paleta":1}', VERSION)} \\gset
      ${guardar('{"paleta":1}', VERSION)} \\gset
      select count(*) || '|' || string_agg(descripcion, ' // ' order by anotado_at, id)
        from retail.actividad where modulo = 'campanas_web' and registro_id = :'etq';
      rollback;`),
    "2|«ZZ Act»: creó su diseño (aniversario) // «ZZ Act»: cambió su diseño (aniversario)",
  );

  // ---------------------------------------------------------------- 5. Se puede volver a pegar
  console.log("\n— Re-ejecutable —");
  if (APLICAR_ANTES) {
    esperarValor(
      "pegar la migración dos veces no duplica el módulo ni la tabla ni rompe el diseño que ya había",
      correr(`${PREPARAR}${campana("ZZ Repite", 20, { hasta: "5" })}${diseno()}
        ${APLICAR_ANTES}
        select concat_ws('|', (select count(*) from retail.modulos where clave = 'campanas_web'),
          (select count(*) from retail.campana_web_disenos where etiqueta_id = :'etq'), jsonb_array_length(${LISTA}));
        rollback;`),
      "1|1|1",
    );
  } else {
    console.log("  (omitido: se prueba con APLICAR_ANTES=…)");
  }

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);
}

main();
