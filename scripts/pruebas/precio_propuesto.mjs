#!/usr/bin/env node
/**
 * Prueba de «Precio propuesto con IA» (ADR-0641; migración `20261110203000_precio_propuesto_con_ia.sql`).
 *
 * Vigila las reglas de Felipe en la BASE, no solo en la web:
 *   · una propuesta queda anotada con la cuenta y la persona;
 *   · ninguna fila deja menos de 30 % de margen (precio × 0,70 ≥ costo), la escriba quien la escriba;
 *   · una fila sin propuesta dice por qué, y una con propuesta trae su costo y su piso;
 *   · el costo de una fila tiene techo (nadie infla el tope de US$ 20 y deja a todos sin IA) y el gasto del mes suma;
 *   · quien no ve Productos no lee el contexto ni anota (proponer es una función de Productos, ADR-0306);
 *   · el contexto trae las parecidas de la categoría con su precio y no se repite la prenda que se revisa;
 *   · la tabla no se lee ni se escribe directo desde la API; la migración se puede pegar dos veces.
 *
 * Cada caso corre en su transacción que TERMINA EN ROLLBACK, con la migración aplicada dentro: el Postgres local compartido no cambia.
 *
 * USO: pnpm pruebas:precio-propuesto   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261110203000_precio_propuesto_con_ia.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed (cuenta)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo (cuenta)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

const como = (cuenta) => `set local request.jwt.claim.sub = '${cuenta}';
set local request.jwt.claims = '{"sub":"${cuenta}","role":"authenticated"}';
set local role authenticated;`;

// Una categoría con prendas con precio (la que más tiene) y una prenda suya: deja `:cat` y `:prod`.
const DATOS = `select p.categoria_id as cat from retail.productos p join retail.variantes v on v.producto_id = p.id and v.precio > 0
  where p.estado = 'activo' and not p.es_prueba group by 1 order by count(distinct p.id) desc limit 1 \\gset
select p.id as prod from retail.productos p join retail.variantes v on v.producto_id = p.id and v.precio > 0
  where p.categoria_id = :'cat' and p.estado = 'activo' and not p.es_prueba limit 1 \\gset`;

// Los argumentos de `registrar_precio_propuesta` en orden, con nombre, para que cada caso diga solo lo que cambia.
const registrar = (o = {}) => {
  const a = {
    p_origen: "'alta'", p_categoria_id: ":'cat'", p_producto_id: "null", p_referencia: "'Polo Luna'", p_costo: "30",
    p_costo_estimado: "false", p_precio_actual: "null", p_piso: "42.90", p_precio_propuesto: "49.90", p_subido_al_piso: "false",
    p_razon: "'Va con el Polo Bianca.'", p_parecidas: "'[]'::jsonb", p_motivo: "null", p_modelo: "'claude-opus-5-5'",
    p_tokens_entrada: "2400", p_tokens_salida: "600", p_costo_usd: "0.0216", p_ms: "9000", ...o,
  };
  return `retail.registrar_precio_propuesta(${Object.entries(a).map(([k, v]) => `${k} => ${v}`).join(", ")})`;
};

const dentro = (cuerpo) => psql(`begin;\n${MIGRACION}\n${DATOS}\n${cuerpo}\nrollback;`);

let fallas = 0;
let total = 0;
function caso(nombre, fn) {
  total++;
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 4).join("\n    ")}`);
  }
}
const da = (esperado, sql) => () => {
  const salida = dentro(sql).split("\n").filter(Boolean).at(-1);
  if (salida !== esperado) return `esperaba «${esperado}» y salió «${salida}»`;
};
const rechaza = (patron, sql) => () => {
  try {
    return `pasó y debía rechazarse: ${dentro(sql)}`;
  } catch (e) {
    if (!patron.test(String(e.stderr))) throw e;
  }
};

caso("una propuesta se anota con la cuenta, la persona y su precio", da("t", `${como(FELIPE)}
select ${registrar()} as id \\gset
reset role;
select cuenta_id = '${FELIPE}' and persona_id is not null and precio_propuesto = 49.90 and piso = 42.90
  from retail.precio_propuestas where id = :'id';`));

caso("EL PISO: una propuesta que deja menos de 30 % de margen no entra", rechaza(/check constraint/, `${como(FELIPE)}
select ${registrar({ p_precio_propuesto: "42.80" })};`));

caso("justo en el piso sí entra (42,90 × 0,70 = 30,03 ≥ 30)", da("1", `${como(FELIPE)}
select ${registrar({ p_precio_propuesto: "42.90" })} as id \\gset
reset role;
select count(*) from retail.precio_propuestas where id = :'id';`));

caso("una propuesta sin costo no entra", rechaza(/check constraint/, `${como(FELIPE)}
select ${registrar({ p_costo: "null" })};`));

caso("sin propuesta, la fila dice por qué (y sin motivo no entra)", da("sin_costo", `${como(FELIPE)}
select ${registrar({ p_costo: "null", p_piso: "null", p_precio_propuesto: "null", p_motivo: "'sin_costo'" })} as id \\gset
reset role;
select motivo from retail.precio_propuestas where id = :'id';`));

caso("con propuesta y motivo a la vez no entra", rechaza(/check constraint/, `${como(FELIPE)}
select ${registrar({ p_motivo: "'tope'" })};`));

caso("el costo de una fila tiene techo: nadie infla el tope del mes", rechaza(/check constraint/, `${como(FELIPE)}
select ${registrar({ p_costo_usd: "25" })};`));

caso("el gasto del mes suma lo de este mes", da("t", `${como(FELIPE)}
select retail.fn_precio_gasto_del_mes() as antes \\gset
select ${registrar()};
select ${registrar({ p_costo_usd: "0.03" })};
select retail.fn_precio_gasto_del_mes() >= :antes + 0.0516;`));

caso("una revisión pide la prenda, y la prenda tiene que ser de esa categoría", rechaza(/check constraint|Producto no válido/, `${como(FELIPE)}
select ${registrar({ p_origen: "'revision'" })};`));

caso("quien no ve Productos no anota", rechaza(/Sin acceso a Productos/, `
delete from retail.rol_modulos where modulo = 'productos';
${como(MICAELA)}
select ${registrar()};`));

caso("quien no ve Productos no lee el contexto", rechaza(/Sin acceso a Productos/, `
delete from retail.rol_modulos where modulo = 'productos';
${como(MICAELA)}
select retail.fn_precio_contexto(:'cat');`));

caso("el contexto trae parecidas con precio, sin la prenda que se revisa", da("t", `${como(FELIPE)}
select retail.fn_precio_contexto(:'cat', null, :'prod') as c \\gset
select jsonb_array_length((:'c'::jsonb) -> 'parecidas') between 1 and 12
   and (:'c'::jsonb) -> 'producto' ->> 'referencia' is not null
   and not exists (select 1 from jsonb_array_elements((:'c'::jsonb) -> 'parecidas') x
                    where x ->> 'referencia' = (:'c'::jsonb) -> 'producto' ->> 'referencia')
   and not exists (select 1 from jsonb_array_elements((:'c'::jsonb) -> 'parecidas') x where (x ->> 'precio')::numeric <= 0);`));

caso("Revisar precios: una prenda con costo real sobre su precio sale como «pierde dinero», primero", da("pierde_dinero", `
update retail.variantes set costo = precio + 10 where producto_id = :'prod' and activo and precio > 0;
${como(FELIPE)}
select motivo from retail.fn_precios_a_revisar(null, 1, 0) where producto_id = :'prod';`));

caso("Revisar precios: sin costo propio NO se acusa pérdida con el promedio de la categoría", da("t", `
update retail.variantes set costo = 0 where producto_id = :'prod';
update retail.variantes v set costo = 4999 from retail.productos p
 where p.id = v.producto_id and p.categoria_id = :'cat' and p.id <> :'prod' and v.activo
   and p.id = (select id from retail.productos where categoria_id = :'cat' and id <> :'prod' limit 1);
${como(FELIPE)}
select not exists (select 1 from retail.fn_precios_a_revisar('pierde_dinero', 100, 0) where producto_id = :'prod');`));

caso("Revisar precios: las familias fuera de los motores (bolsas) no entran", da("t", `
update retail.familias f set entra_a_motores = false from retail.categorias c where c.id = :'cat' and f.codigo = c.familia;
${como(FELIPE)}
select not exists (select 1 from retail.fn_precios_a_revisar(null, 100, 0) where categoria_id = :'cat');`));

caso("Revisar precios: un filtro que no existe se rechaza", rechaza(/Filtro no válido/, `${como(FELIPE)}
select * from retail.fn_precios_a_revisar('inventado');`));

// Para aplicar: la prenda con todas sus tallas en S/ 100 salvo una en S/ 120 (precio propio), costo real S/ 40, y una propuesta de
// revisión de S/ 89.90 hecha sobre ese precio. Deja `:prop`.
const PARA_APLICAR = `
update retail.variantes set precio = 100, costo = 40 where producto_id = :'prod' and activo;
update retail.variantes set precio = 120 where id = (select id from retail.variantes where producto_id = :'prod' and activo order by id limit 1);
update retail.variantes set activo = true where producto_id = :'prod' and id in (select id from retail.variantes where producto_id = :'prod' order by id limit 3);
${como(FELIPE)}
select ${registrar({ p_origen: "'revision'", p_producto_id: ":'prod'", p_costo: "40", p_precio_actual: "100", p_piso: "57.90", p_precio_propuesto: "89.90" })} as prop \\gset`;

caso("Aplicar: cambia las tallas que estaban en el precio base, deja la de precio propio y queda en el historial", da("t", `${PARA_APLICAR}
select retail.aplicar_precio_propuesto(:'prop') as r \\gset
reset role;
select (:'r'::jsonb ->> 'cambiadas')::int >= 1
   and (:'r'::jsonb ->> 'con_precio_propio')::int = 1
   and exists (select 1 from retail.variantes where producto_id = :'prod' and activo and precio = 120)
   and not exists (select 1 from retail.variantes where producto_id = :'prod' and activo and precio = 100)
   and exists (select 1 from retail.historial_producto_cambios h join retail.variantes v on v.id = h.entidad_id
                where v.producto_id = :'prod' and h.campo = 'precio' and h.valor_nuevo::numeric = 89.90)
   and (select aplicada_en is not null and aplicada_por is not null from retail.precio_propuestas where id = :'prop');`));

caso("Aplicar dos veces la misma propuesta no cambia dos veces (un doble clic)", rechaza(/ya se aplicó/, `${PARA_APLICAR}
select retail.aplicar_precio_propuesto(:'prop');
select retail.aplicar_precio_propuesto(:'prop');`));

caso("Aplicar: si alguien cambió el precio después de la propuesta, no se pisa", rechaza(/cambió después de la propuesta/, `${PARA_APLICAR}
reset role;
update retail.variantes set precio = 95 where producto_id = :'prod' and activo and precio = 100;
${como(FELIPE)}
select retail.aplicar_precio_propuesto(:'prop');`));

caso("Aplicar: con el costo de hoy, el piso de 30 % se vuelve a exigir", rechaza(/menos de 30 %/, `${PARA_APLICAR}
reset role;
update retail.variantes set costo = 70 where producto_id = :'prod' and activo;
${como(FELIPE)}
select retail.aplicar_precio_propuesto(:'prop');`));

caso("Aplicar: una propuesta de más de un día no se aplica", rechaza(/más de un día/, `${PARA_APLICAR}
reset role;
update retail.precio_propuestas set creada_en = now() - interval '2 days' where id = :'prop';
${como(FELIPE)}
select retail.aplicar_precio_propuesto(:'prop');`));

caso("Aplicar: quien no edita el catálogo no cambia un precio", rechaza(/Solo quien edita el catálogo/, `${PARA_APLICAR}
reset role;
delete from retail.rol_modulos where modulo in ('productos', 'atributos');
${como(MICAELA)}
select retail.aplicar_precio_propuesto(:'prop');`));

caso("Aplicar: una propuesta del alta no se aplica aquí", rechaza(/no se puede aplicar/, `${como(FELIPE)}
select ${registrar()} as id \\gset
select retail.aplicar_precio_propuesto(:'id');`));

caso("la tabla no se lee ni se escribe directo desde la API", rechaza(/permission denied/, `${como(FELIPE)}
select count(*) from retail.precio_propuestas;`));

caso("la migración se puede pegar dos veces", da("ok", `${MIGRACION}
select 'ok';`));

console.log(`\n${total - fallas}/${total} casos`);
process.exit(fallas ? 1 : 0);
