/**
 * Prueba de `abrir_produccion_con_modelo_nuevo` — ADR-0361 (segunda parte). Migración 20261010180000.
 *
 * Qué garantiza (cada caso termina en ROLLBACK, sin rastro en el Postgres local compartido; cada caso aplica la migración DENTRO de su transacción,
 * así que corre igual antes y después de que el stack la traiga, y de paso prueba que se puede volver a pegar). «Colaborador del Taller» = Micaela
 * reasignada al Taller solo dentro de la transacción; se prueba con `set local role authenticated` para que los permisos apliquen de verdad:
 *   1. Un LÍDER crea el modelo (4 celdas: 2 tallas × 2 colores) y abre su orden en una llamada: 1 producto, 4 variantes con código y a precio, sin costo,
 *      1 orden en proceso con las cantidades y sus 4 líneas; el modelo nace `aprobado`.
 *   2. Un COLABORADOR del Taller que NO edita el catálogo (su rol solo ve Producción) hace lo mismo: el modelo nace `pendiente` y propuesto por él, y se
 *      puede usar de inmediato. Quien SÍ edita el catálogo (el `integrante` del seed ve Productos y Atributos) lo crea `aprobado`: lo decide
 *      `productos_estado_alta_biut` con `fn_puede_editar_catalogo()`, no esta función.
 *   3. UN TOKEN: repetir la llamada con el mismo token devuelve la misma orden; no se duplica el modelo ni la orden.
 *   4. UNA TRANSACCIÓN: si abrir la orden falla (costo negativo), no queda el modelo ni sus variantes.
 *   5. Permisos: quien no opera el Taller no abre; una ubicación que no es Taller se rechaza; `anon` no ejecuta.
 *   6. Precio: una producción sin precio se rechaza; una muestra sin precio entra.
 *   7. Vocabulario: una talla de otra categoría, un color inexistente, una celda repetida, una cantidad en cero o con decimales y una matriz vacía se rechazan
 *      con su frase, y no queda nada.
 *   8. Nombre: uno idéntico a un modelo sin marca se rechaza (y `detail` trae el id del existente, para que la pantalla lo elija); uno que difiere en una
 *      letra pide confirmación, y con ella entra.
 *
 * USO
 *   pnpm pruebas:abrir-produccion-modelo-nuevo   → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261010180000_abrir_produccion_con_modelo_nuevo.sql"), "utf8");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo
const TOKEN = "aaaaaaaa-aaaa-4aaa-8aaa-000000000361";
const TOKEN_2 = "aaaaaaaa-aaaa-4aaa-8aaa-000000000362";
const NOMBRE = "Modelo Prueba Taller";

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

// Una sesión real trae `sub` Y `role` en su JWT; sin el `role`, `auth.role()` es nulo y las políticas de lectura (`productos_select`) no dejan ver nada.
const CAMBIA_A = (uid) => `set local request.jwt.claim.sub = '${uid}';\nset local request.jwt.claim.role = 'authenticated';\n`;
const AUTENTICADO = "set local role authenticated;\n";
const MICAELA_AL_TALLER = `update retail.colaboradores set ubicacion_asignada_id = :'taller' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');\n`;

/** La migración dentro de la transacción, y el escenario: un Taller, una categoría que EXIGE tejido y patrón (para probar que acá no se piden) con dos
 *  tallas habilitadas, una talla que NO es de esa categoría y dos colores activos. */
const PREPARAR = `
begin;
${MIGRACION}
set local request.jwt.claim.sub = '${FELIPE}';
select id as taller from retail.ubicaciones where tipo = 'taller' and activo limit 1 \\gset
select id as tienda from retail.ubicaciones where tipo = 'tienda' and activo order by nombre limit 1 \\gset
select c.id as cat from retail.categorias c join retail.familias f on f.codigo = c.familia
  where c.activo and f.exige_tejido_patron
    and (select count(*) from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = c.id) >= 2
  order by c.nombre limit 1 \\gset
select (array_agg(x.talla_id order by x.valor))[1] as t1, (array_agg(x.talla_id order by x.valor))[2] as t2
  from (select ct.talla_id, t.valor from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo
        where ct.categoria_id = :'cat' order by t.valor limit 2) x \\gset
select t.id as talla_ajena from retail.tallas t
  where t.activo and not exists (select 1 from retail.categoria_tallas ct where ct.categoria_id = :'cat' and ct.talla_id = t.id) limit 1 \\gset
select codigo as c1 from retail.colores where activo order by orden, codigo limit 1 \\gset
select codigo as c2 from retail.colores where activo order by orden, codigo limit 1 offset 1 \\gset
`;

/** Dos tallas × dos colores: 10 + 10 + 5 + 5 = 30 prendas. */
const MATRIZ = `jsonb_build_array(
  jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'cantidad', 10),
  jsonb_build_object('talla_id', :'t2', 'color_codigo', :'c1', 'cantidad', 10),
  jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c2', 'cantidad', 5),
  jsonb_build_object('talla_id', :'t2', 'color_codigo', :'c2', 'cantidad', 5))`;

/** La llamada: precio 40, tela 700, avíos 140. `extra` pisa lo que haga falta (precio, muestra, nombre, token…). */
const LLAMAR = (o = {}) => {
  const p = { ubicacion: ":'taller'", nombre: `'${NOMBRE}'`, cat: ":'cat'", matriz: MATRIZ, precio: "40", tela: "700", avios: "140", maquila: "0",
    muestra: "false", entrega: "null", nota: "null", confirmo: "false", token: `'${TOKEN}'`, ...o };
  return `retail.abrir_produccion_con_modelo_nuevo(${p.ubicacion}, ${p.nombre}, ${p.cat}, ${p.matriz}, ${p.precio}, ${p.tela}, ${p.avios}, ${p.maquila}, ${p.muestra}, ${p.entrega}, ${p.nota}, ${p.confirmo}, ${p.token})`;
};

/** Un bloque DO no ve las variables de psql (`:'taller'`): se pasan por `set_config` justo antes y la llamada las lee de ahí, con su tipo. */
const PUENTE = `select set_config('prueba.taller', :'taller', true), set_config('prueba.cat', :'cat', true), set_config('prueba.t1', :'t1', true),
       set_config('prueba.t2', :'t2', true), set_config('prueba.c1', :'c1', true), set_config('prueba.c2', :'c2', true) \\gset`;
const EN_DO = (sql) =>
  sql.replace(/:'(taller|cat|t1|t2)'/g, (_, v) => `current_setting('prueba.${v}')::uuid`).replace(/:'(c1|c2)'/g, (_, v) => `current_setting('prueba.${v}')`);

// El `integrante` del seed ve Productos y Atributos (= edita el catálogo). Un colaborador del Taller que solo ve Producción se representa quitándole
// esos dos módulos a su rol DENTRO de la transacción (ROLLBACK lo devuelve todo).
const SIN_CATALOGO = `delete from retail.rol_modulos where modulo in ('productos', 'atributos')
  and rol_id = (select c.rol_id from retail.colaboradores c join public.personas p on p.id = c.persona_id where p.auth_user_id = '${MICAELA}');\n`;
const COMO_COLABORADOR = `${SIN_CATALOGO}${MICAELA_AL_TALLER}${CAMBIA_A(MICAELA)}${AUTENTICADO}`;
const COMO_COLABORADOR_CON_CATALOGO = `${MICAELA_AL_TALLER}${CAMBIA_A(MICAELA)}${AUTENTICADO}`;
const CUENTA_DEL_MODELO = (nombre = NOMBRE) => `(select count(*) from retail.productos where referencia = '${nombre}')`;

const CASOS = [
  {
    nombre: "1. un LÍDER crea el modelo y abre su orden en una llamada (4 variantes con código y precio, sin costo; modelo aprobado)",
    tipo: "exito",
    sql: `${PREPARAR}${AUTENTICADO}
select ${LLAMAR()} as ord \\gset
reset role;
select ${CUENTA_DEL_MODELO()},
       (select count(*) from retail.variantes v join retail.productos p on p.id = v.producto_id
         where p.referencia = '${NOMBRE}' and v.codigo is not null and v.costo = 0 and v.precio = 40 and v.activo),
       (select estado from retail.producciones where id = :'ord'),
       (select cantidad_plan from retail.producciones where id = :'ord'),
       (select count(*) from retail.produccion_lineas where produccion_id = :'ord'),
       (select estado_alta from retail.productos where referencia = '${NOMBRE}'),
       (select es_muestra from retail.producciones where id = :'ord');
rollback;`,
    verificar: (c) => Number(c[0]) === 1 && Number(c[1]) === 4 && c[2] === "en_proceso" && Number(c[3]) === 30 && Number(c[4]) === 4 && c[5] === "aprobado" && c[6] === "f",
  },
  {
    nombre: "2. un COLABORADOR del Taller (sin permiso de catálogo) también puede: el modelo nace pendiente y propuesto por él",
    tipo: "exito",
    sql: `${PREPARAR}${COMO_COLABORADOR}
select ${LLAMAR()} as ord \\gset
reset role;
select (select estado_alta from retail.productos where referencia = '${NOMBRE}'),
       (select propuesto_por = (select id from public.personas where auth_user_id = '${MICAELA}') from retail.productos where referencia = '${NOMBRE}'),
       (select estado from retail.producciones where id = :'ord'),
       (select count(*) from retail.produccion_lineas where produccion_id = :'ord'),
       (select count(*) from retail.variantes v join retail.productos p on p.id = v.producto_id where p.referencia = '${NOMBRE}' and v.codigo is not null);
rollback;`,
    verificar: (c) => c[0] === "pendiente" && c[1] === "t" && c[2] === "en_proceso" && Number(c[3]) === 4 && Number(c[4]) === 4,
  },
  {
    nombre: "2b. un colaborador que SÍ edita el catálogo (rol con Productos) crea el modelo ya aprobado: lo decide el disparador, no la función",
    tipo: "exito",
    sql: `${PREPARAR}${COMO_COLABORADOR_CON_CATALOGO}
select ${LLAMAR()} as ord \\gset
reset role;
select (select estado_alta from retail.productos where referencia = '${NOMBRE}'),
       (select estado from retail.producciones where id = :'ord');
rollback;`,
    verificar: (c) => c[0] === "aprobado" && c[1] === "en_proceso",
  },
  {
    nombre: "3. UN TOKEN: repetir la llamada devuelve la misma orden y no duplica ni el modelo ni la orden",
    tipo: "exito",
    sql: `${PREPARAR}${COMO_COLABORADOR}
select ${LLAMAR()} as ord1 \\gset
select ${LLAMAR()} as ord2 \\gset
select :'ord1' = :'ord2',
       ${CUENTA_DEL_MODELO()},
       (select count(*) from retail.producciones where token_cliente = '${TOKEN}'),
       (select count(*) from retail.variantes v join retail.productos p on p.id = v.producto_id where p.referencia = '${NOMBRE}');
rollback;`,
    verificar: (c) => c[0] === "t" && Number(c[1]) === 1 && Number(c[2]) === 1 && Number(c[3]) === 4,
  },
  {
    nombre: "4. UNA TRANSACCIÓN: si la orden falla DESPUÉS de crear el modelo (un disparador de prueba que rechaza el insert), no queda el modelo ni sus variantes",
    tipo: "exito",
    // Antes el fallo tardío se provocaba con un costo de tela negativo (el CHECK de `producciones`); desde /chaos 2026-10-10 la función lo rechaza ANTES de crear nada,
    // así que el fallo se fabrica con un disparador (creado y revertido dentro de la transacción): el modelo ya se insertó cuando la orden revienta.
    sql: `${PREPARAR}
create function public.zz_falla_tardia() returns trigger language plpgsql as $f$ begin raise exception 'falla tardía de prueba'; end $f$;
create trigger zz_falla_tardia before insert on retail.producciones for each row execute function public.zz_falla_tardia();
${COMO_COLABORADOR}
${PUENTE}
do $$ begin
  begin
    perform ${EN_DO(LLAMAR())};
  exception when others then
    perform set_config('prueba.fallo', sqlerrm, true);
  end;
end $$;
reset role;
select ${CUENTA_DEL_MODELO()}, (select count(*) from retail.producciones where token_cliente = '${TOKEN}'),
       current_setting('prueba.fallo', true) ilike '%falla tardía de prueba%';
rollback;`,
    verificar: (c) => Number(c[0]) === 0 && Number(c[1]) === 0 && c[2] === "t",
  },
  {
    nombre: "5a. quien NO opera el Taller no abre (Micaela, de Trujillo, sin reasignar)",
    tipo: "error",
    contiene: "No tienes permiso para abrir órdenes en esa ubicación",
    sql: `${PREPARAR}${CAMBIA_A(MICAELA)}${AUTENTICADO}select ${LLAMAR()};\nrollback;`,
  },
  {
    nombre: "5b. una ubicación que no es el Taller se rechaza, aun siendo líder",
    tipo: "error",
    contiene: "Solo el Taller abre órdenes de producción",
    sql: `${PREPARAR}${AUTENTICADO}select ${LLAMAR({ ubicacion: ":'tienda'" })};\nrollback;`,
  },
  {
    nombre: "5c. anon no puede ejecutarla",
    tipo: "error",
    contiene: "permission denied for function",
    sql: `${PREPARAR}set local role anon;\nselect ${LLAMAR()};\nrollback;`,
  },
  {
    nombre: "6a. una PRODUCCIÓN sin precio se rechaza, con el hint que la pantalla entiende",
    tipo: "error",
    contiene: "Una producción necesita el precio a tienda",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ precio: "0" })};\nrollback;`,
  },
  {
    nombre: "6b. una MUESTRA sin precio entra: el modelo nace con precio 0 para completarlo al aprobar la muestra",
    tipo: "exito",
    sql: `${PREPARAR}${COMO_COLABORADOR}
select ${LLAMAR({ precio: "0", muestra: "true" })} as ord \\gset
select (select es_muestra from retail.producciones where id = :'ord'),
       (select count(*) from retail.variantes v join retail.productos p on p.id = v.producto_id where p.referencia = '${NOMBRE}' and v.precio = 0);
rollback;`,
    verificar: (c) => c[0] === "t" && Number(c[1]) === 4,
  },
  {
    nombre: "7a. una talla que no es de la categoría se rechaza",
    tipo: "error",
    contiene: "no está habilitada para esta categoría",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ matriz: "jsonb_build_array(jsonb_build_object('talla_id', :'talla_ajena', 'color_codigo', :'c1', 'cantidad', 3))" })};\nrollback;`,
  },
  {
    nombre: "7b. un color que no está en el vocabulario se rechaza (nada de «Negro»/«negro» a mano)",
    tipo: "error",
    contiene: "ya no está activo en el vocabulario",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ matriz: "jsonb_build_array(jsonb_build_object('talla_id', :'t1', 'color_codigo', 'color-inventado', 'cantidad', 3))" })};\nrollback;`,
  },
  {
    nombre: "7c. la misma celda dos veces se rechaza antes de que el índice la rechace feo",
    tipo: "error",
    contiene: "Repetiste la misma combinación de talla y color",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ matriz: "jsonb_build_array(jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'cantidad', 3), jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'cantidad', 4))" })};\nrollback;`,
  },
  {
    nombre: "7d. una cantidad en cero se rechaza",
    tipo: "error",
    contiene: "una cantidad entera mayor que cero",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ matriz: "jsonb_build_array(jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'cantidad', 0))" })};\nrollback;`,
  },
  {
    nombre: "7e. una cantidad con decimales se rechaza con la frase clara (no con un error técnico de conversión)",
    tipo: "error",
    contiene: "una cantidad entera mayor que cero",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ matriz: "jsonb_build_array(jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'cantidad', 1.5))" })};\nrollback;`,
  },
  {
    nombre: "7f. una matriz vacía se rechaza",
    tipo: "error",
    contiene: "al menos una talla o color con su cantidad",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ matriz: "'[]'::jsonb" })};\nrollback;`,
  },
  {
    nombre: "8a. un nombre idéntico a un modelo sin marca se rechaza y `detail` trae el id del existente",
    tipo: "error",
    contiene: "Ya existe un modelo llamado",
    sql: `${PREPARAR}${COMO_COLABORADOR}
select ${LLAMAR()} as ord \\gset
select ${LLAMAR({ token: `'${TOKEN_2}'` })};
rollback;`,
  },
  {
    nombre: "8b. un nombre que difiere en UNA letra pide confirmación…",
    tipo: "error",
    contiene: "se escribe casi igual",
    sql: `${PREPARAR}${COMO_COLABORADOR}
select ${LLAMAR()} as ord \\gset
select ${LLAMAR({ nombre: "'Modelo Prueba Tallar'", token: `'${TOKEN_2}'` })};
rollback;`,
  },
  {
    nombre: "8c. …y con la confirmación entra (son dos modelos distintos)",
    tipo: "exito",
    sql: `${PREPARAR}${COMO_COLABORADOR}
select ${LLAMAR()} as ord \\gset
select ${LLAMAR({ nombre: "'Modelo Prueba Tallar'", token: `'${TOKEN_2}'`, confirmo: "true" })} as ord2 \\gset
select :'ord' <> :'ord2', ${CUENTA_DEL_MODELO(NOMBRE)}, ${CUENTA_DEL_MODELO("Modelo Prueba Tallar")};
rollback;`,
    verificar: (c) => c[0] === "t" && Number(c[1]) === 1 && Number(c[2]) === 1,
  },
  // ── /chaos 2026-10-10 (semilla 1010), hallazgos #1, #2, #4 y #5: lo que antes entraba sin que nadie lo dijera. Cada caso nació como el ataque que lo encontró.
  {
    nombre: "10a. un nombre de 81 letras se rechaza (el tablero no aguanta una tarjeta de 9.000 px)",
    tipo: "error",
    contiene: "El nombre del modelo es demasiado largo",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ nombre: `'${"Modelo ".repeat(12).slice(0, 81)}'` })};\nrollback;`,
  },
  {
    nombre: "10b. un nombre de exactamente 80 letras entra",
    tipo: "exito",
    sql: `${PREPARAR}${COMO_COLABORADOR}
select ${LLAMAR({ nombre: `'${"Modelo ".repeat(12).slice(0, 80).trim()}'` })} as ord \\gset
select (select length(p.referencia) from retail.productos p join retail.producciones pr on pr.producto_id = p.id where pr.id = :'ord') = 80, (select estado from retail.producciones where id = :'ord');
rollback;`,
    verificar: (c) => c[0] === "t" && c[1] === "en_proceso",
  },
  {
    nombre: "10c. una nota de 201 caracteres se rechaza",
    tipo: "error",
    contiene: "La nota es demasiado larga",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ nota: "repeat('n', 201)" })};\nrollback;`,
  },
  {
    nombre: "11a. un precio de 0.001 NO cuenta como precio en una producción (se guardaba como 0,00: la prenda sin precio que la regla quería impedir)",
    tipo: "error",
    contiene: "Una producción necesita el precio a tienda",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ precio: "0.001" })};\nrollback;`,
  },
  {
    nombre: "11b. una MUESTRA con precio de 0.001 entra con precio 0 (se completa al aprobarla)",
    tipo: "exito",
    sql: `${PREPARAR}${COMO_COLABORADOR}
select ${LLAMAR({ precio: "0.001", muestra: "true" })} as ord \\gset
select (select string_agg(distinct v.precio::text, ',') from retail.variantes v join retail.productos p on p.id = v.producto_id where p.referencia = '${NOMBRE}');
rollback;`,
    verificar: (c) => c[0] === "0.00",
  },
  {
    nombre: "11c. un precio NaN se rechaza (NaN > 0 es verdadero y el CHECK precio >= 0 lo deja pasar)",
    tipo: "error",
    contiene: "El precio a tienda no es un número válido",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ precio: "'NaN'::numeric" })};\nrollback;`,
  },
  {
    nombre: "11d. un precio de 100.000 soles por prenda se rechaza",
    tipo: "error",
    contiene: "El precio a tienda no puede pasar de",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ precio: "100000" })};\nrollback;`,
  },
  {
    nombre: "11e. un precio con tres decimales se guarda redondeado a céntimos (12.345 → 12.35)",
    tipo: "exito",
    sql: `${PREPARAR}${COMO_COLABORADOR}
select ${LLAMAR({ precio: "12.345" })} as ord \\gset
select (select string_agg(distinct v.precio::text, ',') from retail.variantes v join retail.productos p on p.id = v.producto_id where p.referencia = '${NOMBRE}');
rollback;`,
    verificar: (c) => c[0] === "12.35",
  },
  {
    nombre: "11f. un precio nulo dice que no es un número válido (no «negativo»)",
    tipo: "error",
    contiene: "El precio a tienda no es un número válido",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ precio: "null::numeric" })};\nrollback;`,
  },
  {
    nombre: "12a. un costo de tela NaN se rechaza",
    tipo: "error",
    contiene: "El costo de la tela no es un número válido",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ tela: "'NaN'::numeric" })};\nrollback;`,
  },
  {
    nombre: "12b. un costo negativo se rechaza con una frase, no con «violates check constraint»",
    tipo: "error",
    contiene: "El costo de los avíos no puede ser negativo",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ avios: "-0.01" })};\nrollback;`,
  },
  {
    nombre: "12c. un costo de mil millones se rechaza (con 1e9 el costo unitario salía 333 millones)",
    tipo: "error",
    contiene: "El costo de la maquila no puede pasar de",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ maquila: "1000000000" })};\nrollback;`,
  },
  {
    nombre: "12d. un costo nulo vale 0 y uno con tres decimales se redondea a céntimos",
    tipo: "exito",
    sql: `${PREPARAR}${COMO_COLABORADOR}
select ${LLAMAR({ tela: "null::numeric", avios: "0.126", maquila: "0.001" })} as ord \\gset
reset role;
select (select costo_tela from retail.producciones where id = :'ord'), (select costo_avios from retail.producciones where id = :'ord'), (select costo_maquila from retail.producciones where id = :'ord');
rollback;`,
    verificar: (c) => c[0] === "0.00" && c[1] === "0.13" && c[2] === "0.00",
  },
  {
    nombre: "13a. una línea SIN talla en una categoría que sí tiene tallas se rechaza (nacía la variante «…-U» sin talla)",
    tipo: "error",
    contiene: "necesita su talla",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ matriz: "jsonb_build_array(jsonb_build_object('talla_id', null, 'color_codigo', :'c1', 'cantidad', 3))" })};\nrollback;`,
  },
  {
    nombre: "13b. una talla que no es un uuid se rechaza con la frase del vocabulario (no con «invalid input syntax for type uuid»)",
    tipo: "error",
    contiene: "no está habilitada para esta categoría",
    sql: `${PREPARAR}${COMO_COLABORADOR}select ${LLAMAR({ matriz: "jsonb_build_array(jsonb_build_object('talla_id', 'no-es-uuid', 'color_codigo', :'c1', 'cantidad', 3))" })};\nrollback;`,
  },
  {
    nombre: "9. la migración se puede volver a pegar: la función sigue existiendo y funcionando",
    tipo: "exito",
    sql: `${PREPARAR}${MIGRACION}
${AUTENTICADO}
select ${LLAMAR()} as ord \\gset
select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'abrir_produccion_con_modelo_nuevo'),
       (select estado from retail.producciones where id = :'ord');
rollback;`,
    verificar: (c) => Number(c[0]) === 1 && c[1] === "en_proceso",
  },
];

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    if (caso.tipo === "error") {
      if (resultado.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error ("${caso.contiene}") y no hubo ninguno`);
      } else if (!resultado.mensaje.includes(caso.contiene)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error con "${caso.contiene}", salió:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    } else if (!resultado.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
    } else {
      const filas = resultado.salida.split("\n").filter((l) => l.trim() !== "" && l.trim().toUpperCase() !== "ROLLBACK");
      const columnas = filas[filas.length - 1].split("|");
      if (!caso.verificar(columnas)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    valores inesperados: ${JSON.stringify(columnas)}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
