#!/usr/bin/env node
/**
 * Prueba de ADR-0452 — la ficha de pago de un gasto fijo (`20261018003000_gasto_fijo_ficha_de_pago.sql`).
 *
 * QUÉ CUBRE
 *   · el líder guarda un fijo CON su ficha en una sola llamada; todo se normaliza en la base (CCI y celular solo con números,
 *     sin +51; documento sin espacios; correo en minúsculas) y se lee de vuelta;
 *   · una llamada vieja (9 o 10 argumentos, sin ficha) no toca la ficha; con ficha parcial solo cambian las llaves que vienen, y
 *     `null` borra;
 *   · el historial anota cada cambio de a quién y cómo se paga, una vez por cambio real (guardar lo mismo no anota nada), y solo
 *     lo lee el líder;
 *   · los datos bancarios son SOLO del líder y admin: una colaboradora con el módulo Gastos guarda y lee el resto de la ficha de
 *     su tienda, pero no puede cambiar la cuenta y su lectura la trae vacía (y sin «tiene cuenta»);
 *   · cada quien ve solo lo de su tienda; un fijo «de la empresa» es del líder;
 *   · los errores comunes hablan en criollo y un guardado que falla no deja el fijo a medias;
 *   · nadie lee las dos tablas directo, y los candados de la tabla frenan lo que la función no atajó;
 *   · los 9 proveedores de servicios que siembra 20261018004000 quedan en la lista de gastos.
 *
 * CÓMO. Igual que `activos_y_gastos_fijos.mjs`: cada escenario en su transacción con ROLLBACK, sesión simulada con
 *   `request.jwt.claim.sub`.
 *
 * USO
 *   pnpm pruebas:gasto-fijo-ficha    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$f$;
`;
const ESCENA = `
begin;
${INTENTO}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
`;
const conModulo = (m) => `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), '${m}');\n`;
/** Un objeto JS como literal jsonb de SQL. */
const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
/** Intenta guardar un fijo nuevo de Trujillo con esa ficha: devuelve el mensaje o SIN_ERROR. */
const intentarFicha = (o) =>
  `select pg_temp.intento(format('select retail.guardar_gasto_fijo(null, %L, ''alquileres'', ''Fijo de prueba'', null, ''factura'', 100, false, 1, ''dia'', %L::jsonb)', :'tru', ${lit(o)}));`;

const FICHA_COMPLETA = {
  beneficiario: "Rosa Quispe Huamán",
  documento_tipo: "dni",
  documento_numero: "45 678 901",
  telefono: "+51 987 654 321",
  correo: "Rosa@Mail.com",
  forma_de_pago: "transferencia",
  banco: "BCP",
  cuenta_bancaria: "193-1234567-0-12",
  cci: "002-193-001234567012-58",
  celular_billetera: "+51 987 654 321",
  billeteras: ["Yape"],
  titular_cuenta: "Rosa Quispe Huamán",
  codigo_servicio: "Contrato 2024-17",
  recibo_llega: "Lo deja en la tienda",
  contrato_vence: "2027-03-31",
  notas: "Prefiere transferencia el 5",
};
const GUARDAR_COMPLETA = `select retail.guardar_gasto_fijo(null, :'tru', 'alquileres', 'Alquiler del local', null, 'recibo_por_honorarios', 2500, false, 1, 'fin_de_mes', ${lit(FICHA_COMPLETA)}::jsonb) as f \\gset`;

let fallos = 0;
function esperar(nombre, ok, resultado) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 800)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

// 1. El líder guarda el fijo con su ficha completa; la base normaliza y se lee de vuelta.
{
  const r = correr(`${ESCENA}
${GUARDAR_COMPLETA}
select beneficiario, documento_tipo || ':' || documento_numero, telefono, correo, forma_de_pago, cci, celular_billetera, array_to_string(billeteras, ','), codigo_servicio, contrato_vence, puede_ver_banco, tiene_cuenta from retail.fn_gasto_fijo_ficha(:'f');
select cuenta_bancaria, banco, titular_cuenta, recibo_llega, notas from retail.fn_gasto_fijo_ficha(:'f');
select momento from retail.gastos_fijos where id = :'f';`);
  const [a, b, momento] = lineas(r);
  esperar(
    "ficha completa: DNI sin espacios, CCI y celular solo con números (sin +51), correo en minúsculas, Yape en minúsculas",
    r.ok && a === "Rosa Quispe Huamán|dni:45678901|+51 987 654 321|rosa@mail.com|transferencia|00219300123456701258|987654321|yape|Contrato 2024-17|2027-03-31|t|t",
    r
  );
  esperar("la cuenta, el banco, el titular, cómo llega el recibo y las notas se guardan tal cual", r.ok && b === "193-1234567-0-12|BCP|Rosa Quispe Huamán|Lo deja en la tienda|Prefiere transferencia el 5", r);
  esperar("el fijo se guardó con su «cuándo llega» de siempre", r.ok && momento === "fin_de_mes", r);
}

// 2. Llamadas viejas no tocan la ficha; una ficha parcial cambia solo lo que viene; null borra.
{
  const r = correr(`${ESCENA}
${GUARDAR_COMPLETA}
select retail.guardar_gasto_fijo(:'f', :'tru', 'alquileres', 'Alquiler del local', null, 'recibo_por_honorarios', 2600, false, 1) as _g \\gset
select beneficiario, cci from retail.fn_gasto_fijo_ficha(:'f');
select retail.guardar_gasto_fijo(:'f', :'tru', 'alquileres', 'Alquiler del local', null, 'recibo_por_honorarios', 2600, false, 1, 'fin_de_mes') as _g \\gset
select beneficiario, cci from retail.fn_gasto_fijo_ficha(:'f');
select retail.guardar_gasto_fijo(:'f', :'tru', 'alquileres', 'Alquiler del local', null, 'recibo_por_honorarios', 2600, false, 1, 'fin_de_mes', '{"telefono": "012345678", "notas": null}'::jsonb) as _g \\gset
select beneficiario, telefono, notas, cci, codigo_servicio from retail.fn_gasto_fijo_ficha(:'f');
select monto from retail.gastos_fijos where id = :'f';`);
  const [nueve, diez, parcial, monto] = lineas(r);
  esperar("la llamada de 9 argumentos (sin ficha) no toca la ficha", r.ok && nueve === "Rosa Quispe Huamán|00219300123456701258", r);
  esperar("la de 10 tampoco", r.ok && diez === "Rosa Quispe Huamán|00219300123456701258", r);
  esperar("una ficha parcial cambia el teléfono, borra las notas con null y deja lo demás", r.ok && parcial === "Rosa Quispe Huamán|012345678||00219300123456701258|Contrato 2024-17", r);
  esperar("el fijo mismo se actualizó en esas llamadas", r.ok && monto === "2600.00", r);
}

// 3. El historial: una fila por cambio real; guardar lo mismo no anota nada; solo el líder lo lee.
{
  const r = correr(`${ESCENA}
${GUARDAR_COMPLETA}
select count(*) from retail.gastos_fijos_ficha_cambios where gasto_fijo_id = :'f';
select retail.guardar_gasto_fijo(:'f', :'tru', 'alquileres', 'Alquiler del local', null, 'recibo_por_honorarios', 2500, false, 1, 'fin_de_mes', ${lit({ cci: "002-193-001234567012-58", beneficiario: "Rosa Quispe Huamán" })}::jsonb) as _g \\gset
select count(*) from retail.gastos_fijos_ficha_cambios where gasto_fijo_id = :'f';
select retail.guardar_gasto_fijo(:'f', :'tru', 'alquileres', 'Alquiler del local', null, 'recibo_por_honorarios', 2500, false, 1, 'fin_de_mes', '{"cci": "002-193-009999999999-58"}'::jsonb) as _g \\gset
select campo, antes, despues from retail.fn_gasto_fijo_ficha_cambios(:'f') where campo = 'cci' order by cambiado_en desc limit 1;
select count(*) from retail.gastos_fijos_ficha_cambios where gasto_fijo_id = :'f';
select retail.guardar_gasto_fijo(:'f', :'tru', 'alquileres', 'Alquiler del local', null, 'recibo_por_honorarios', 2500, false, 1, 'fin_de_mes', '{"notas": "otra nota", "codigo_servicio": "Contrato 9"}'::jsonb) as _g \\gset
select count(*) from retail.gastos_fijos_ficha_cambios where gasto_fijo_id = :'f';`);
  const [primera, igual, ultimo, tras, notas] = lineas(r);
  esperar("la primera carga anota las 9 cosas de a quién y cómo se paga", r.ok && Number(primera) === 9, r);
  esperar("guardar lo mismo no anota nada", r.ok && Number(igual) === 9, r);
  esperar("cambiar el CCI anota el antes y el después", r.ok && ultimo === "cci|00219300123456701258|00219300999999999958" && Number(tras) === 10, r);
  esperar("cambiar notas o código del servicio no entra al historial (no es a quién ni cómo se paga)", r.ok && Number(notas) === 10, r);
}

// 4. Una colaboradora con el módulo Gastos: guarda y lee el resto de la ficha de su tienda, pero NO la cuenta.
{
  const r = correr(`${ESCENA}
${GUARDAR_COMPLETA}
${cambiaA(MICAELA)}${conModulo("gastos")}
select pg_temp.intento(format('select retail.guardar_gasto_fijo(%L, %L, ''alquileres'', ''Alquiler del local'', null, ''recibo_por_honorarios'', 2500, false, 1, ''fin_de_mes'', ''{"telefono": "014445555", "codigo_servicio": "Contrato 18"}''::jsonb)', :'f', :'tru'));
select pg_temp.intento(format('select retail.guardar_gasto_fijo(%L, %L, ''alquileres'', ''Alquiler del local'', null, ''recibo_por_honorarios'', 2500, false, 1, ''fin_de_mes'', ''{"cci": "002-193-000000000000-58"}''::jsonb)', :'f', :'tru'));
select pg_temp.intento(format('select retail.guardar_gasto_fijo(%L, %L, ''alquileres'', ''Alquiler del local'', null, ''recibo_por_honorarios'', 2500, false, 1, ''fin_de_mes'', ''{"titular_cuenta": null}''::jsonb)', :'f', :'tru'));
select beneficiario, telefono, codigo_servicio, forma_de_pago, coalesce(cci, 'sin') || '/' || coalesce(banco, 'sin') || '/' || coalesce(array_to_string(billeteras, ','), 'sin'), puede_ver_banco, coalesce(tiene_cuenta::text, 'null') from retail.fn_gasto_fijo_ficha(:'f');
select count(*) from retail.fn_gasto_fijo_ficha_cambios(:'f');
select coalesce(tiene_cuenta::text, 'null'), beneficiario from retail.fn_gastos_fijos_fichas() where gasto_fijo_id = :'f';
${cambiaA(FELIPE)}
select cci, codigo_servicio from retail.fn_gasto_fijo_ficha(:'f');`);
  const [ok, banco, titular, lectura, historial, lista, lider] = lineas(r);
  esperar("con el módulo, guarda el teléfono y el código de servicio de su tienda", r.ok && ok === "SIN_ERROR", r);
  esperar("pero no puede cambiar el CCI: «solo un líder o admin»", r.ok && banco.includes("solo un líder o admin"), r);
  esperar("ni siquiera borrar el titular de la cuenta", r.ok && titular.includes("solo un líder o admin"), r);
  esperar("lee la ficha, y la cuenta, el banco y Yape salen vacíos con «tiene cuenta» desconocido", r.ok && lectura === "Rosa Quispe Huamán|014445555|Contrato 18|transferencia|sin/sin/sin|f|null", r);
  esperar("el historial de cambios de cuenta no es suyo: cero filas", r.ok && Number(historial) === 0, r);
  esperar("la lista de fichas tampoco le dice si hay cuenta", r.ok && lista === "null|Rosa Quispe Huamán", r);
  esperar("y la cuenta del líder quedó intacta", r.ok && lider === "00219300123456701258|Contrato 18", r);
}

// 5. Cada quien ve lo de su tienda; «de la empresa» es del líder.
{
  const r = correr(`${ESCENA}
select retail.guardar_gasto_fijo(null, :'lim', 'alquileres', 'Alquiler Lima', null, 'factura', 3000, false, 5, 'dia', '{"beneficiario": "Inmobiliaria Lima"}'::jsonb) as flim \\gset
select retail.guardar_gasto_fijo(null, null, 'asesoria', 'Contador', null, 'recibo_por_honorarios', 800, false, 5, 'dia', '{"beneficiario": "CPC Pérez"}'::jsonb) as femp \\gset
select retail.guardar_gasto_fijo(null, :'tru', 'alquileres', 'Alquiler Trujillo', null, 'factura', 2000, false, 5, 'dia', '{"beneficiario": "Propietario Trujillo"}'::jsonb) as ftru \\gset
select count(*) from retail.fn_gasto_fijo_ficha(:'flim') union all select count(*) from retail.fn_gasto_fijo_ficha(:'femp');
${cambiaA(MICAELA)}${conModulo("gastos")}
select count(*) from retail.fn_gasto_fijo_ficha(:'ftru');
select count(*) from retail.fn_gasto_fijo_ficha(:'flim');
select count(*) from retail.fn_gasto_fijo_ficha(:'femp');
select string_agg(beneficiario, ',' order by beneficiario) from retail.fn_gastos_fijos_fichas();
select pg_temp.intento(format('select retail.guardar_gasto_fijo(%L, %L, ''alquileres'', ''Alquiler Lima'', null, ''factura'', 3000, false, 5, ''dia'', ''{"beneficiario": "Otro"}''::jsonb)', :'flim', :'lim'));
select pg_temp.intento(format('select retail.guardar_gasto_fijo(%L, null, ''asesoria'', ''Contador'', null, ''recibo_por_honorarios'', 800, false, 5, ''dia'', ''{"beneficiario": "Otro"}''::jsonb)', :'femp'));`);
  const [lim, emp, suya, otra, empresa, lista, escribeLima, escribeEmpresa] = lineas(r);
  esperar("el líder ve la ficha de Lima y la de la empresa", r.ok && lim === "1" && emp === "1", r);
  esperar("la colaboradora de Trujillo ve la ficha de su tienda", r.ok && Number(suya) === 1, r);
  esperar("no ve la de Lima ni la «de la empresa»", r.ok && Number(otra) === 0 && Number(empresa) === 0, r);
  esperar("su lista de fichas trae solo la de su tienda", r.ok && lista === "Propietario Trujillo", r);
  esperar("no puede escribir la ficha de otra tienda ni la de la empresa", r.ok && escribeLima.includes("esa tienda") && escribeEmpresa.includes("esa tienda"), r);
}

// 6. Errores comunes en criollo, y un guardado que falla no deja el fijo a medias.
{
  const r = correr(`${ESCENA}
${intentarFicha({ documento_tipo: "dni", documento_numero: "1234567" })}
${intentarFicha({ documento_tipo: "ruc", documento_numero: "2012345" })}
${intentarFicha({ documento_tipo: "dni" })}
${intentarFicha({ cci: "002193001234567012" })}
${intentarFicha({ celular_billetera: "987654321" })}
${intentarFicha({ celular_billetera: "787654321", billeteras: ["yape"] })}
${intentarFicha({ celular_billetera: "987654321", billeteras: ["paypal"] })}
${intentarFicha({ forma_de_pago: "bitcoin" })}
${intentarFicha({ correo: "rosa" })}
${intentarFicha({ telefono: "abc" })}
${intentarFicha({ contrato_vence: "mañana" })}
${intentarFicha({ sorpresa: "x" })}
${intentarFicha({ notas: 5 })}
select count(*) from retail.gastos_fijos where descripcion = 'Fijo de prueba';
${intentarFicha({ beneficiario: "Solo el nombre", forma_de_pago: "recibo", codigo_servicio: "NIS 1234567" })}
select count(*) from retail.gastos_fijos where descripcion = 'Fijo de prueba';`);
  const l = lineas(r);
  esperar("un DNI de 7 números: «tiene 8»", r.ok && l[0] === "El DNI tiene 8 números.", r);
  esperar("un RUC corto: «tiene 11»", r.ok && l[1] === "El RUC tiene 11 números.", r);
  esperar("un tipo de documento sin número", r.ok && l[2].includes("tipo de documento y escribe su número"), r);
  esperar("un CCI de 18 números", r.ok && l[3].includes("El CCI tiene 20 números"), r);
  esperar("un celular de Yape sin decir la app", r.ok && l[4].includes("hacen falta el celular y la app"), r);
  esperar("un celular que no empieza con 9", r.ok && l[5].includes("tiene 9 números y empieza con 9"), r);
  esperar("una billetera que no es Yape ni Plin", r.ok && l[6].includes("Elige Yape, Plin o los dos"), r);
  esperar("una forma de pago inventada", r.ok && l[7].includes("Elige cómo se paga"), r);
  esperar("un correo sin forma de correo", r.ok && l[8].includes("no parece un correo"), r);
  esperar("un teléfono con letras", r.ok && l[9].includes("lleva solo números"), r);
  esperar("una fecha de contrato que no es fecha", r.ok && l[10].includes("no es una fecha válida"), r);
  esperar("un campo que no existe en la ficha", r.ok && l[11].includes("no tiene el campo «sorpresa»"), r);
  esperar("un número donde va un texto", r.ok && l[12].includes("tiene que ser un texto"), r);
  esperar("ninguno de esos guardados dejó el fijo a medias", r.ok && Number(l[13]) === 0, r);
  esperar("una ficha con tres datos y nada más es válida: se completa de a poco", r.ok && l[14] === "SIN_ERROR" && Number(l[15]) === 1, r);
}

// 7. Nadie lee las tablas directo, y los candados de la tabla frenan lo que la función no atajó.
{
  const r = correr(`${ESCENA}
${GUARDAR_COMPLETA}
select pg_temp.intento(format('insert into retail.gastos_fijos_ficha (gasto_fijo_id, cci) values (%L, ''123'')', gen_random_uuid()));
select pg_temp.intento(format('update retail.gastos_fijos_ficha set celular_billetera = ''987654321'', billeteras = null where gasto_fijo_id = %L', :'f'));
select pg_temp.intento(format('update retail.gastos_fijos_ficha set beneficiario = ''  '' where gasto_fijo_id = %L', :'f'));
select pg_temp.intento(format('update retail.gastos_fijos_ficha set contrato_vence = date ''1999-01-01'' where gasto_fijo_id = %L', :'f'));
select pg_temp.intento(format('update retail.gastos_fijos_ficha set notas = repeat(''x'', 501) where gasto_fijo_id = %L', :'f'));
set local role authenticated;
select pg_temp.intento('select count(*) from retail.gastos_fijos_ficha');
select pg_temp.intento('select count(*) from retail.gastos_fijos_ficha_cambios');
select pg_temp.intento('delete from retail.gastos_fijos_ficha_cambios');`);
  const l = lineas(r);
  esperar("la base rechaza un CCI de 3 números aunque no pase por la función", r.ok && l[0].includes("violates") || l[0].includes("viola") || l[0].includes("foreign key"), r);
  esperar("un celular de billetera sin app", r.ok && l[1].includes("gastos_fijos_ficha_billetera_coherente"), r);
  esperar("un nombre en blanco", r.ok && l[2].includes("gastos_fijos_ficha_sin_vacios"), r);
  esperar("una fecha de contrato del año 1999", r.ok && l[3].includes("gastos_fijos_ficha_contrato_fecha_real"), r);
  esperar("una nota de 501 letras", r.ok && l[4].includes("gastos_fijos_ficha_textos_con_tope"), r);
  esperar("nadie lee `gastos_fijos_ficha` directo", r.ok && l[5].includes("permission denied"), r);
  esperar("ni su historial", r.ok && l[6].includes("permission denied"), r);
  esperar("ni lo borra", r.ok && l[7].includes("permission denied"), r);
}

// 8. Un fijo archivado deja de aparecer en la lista de fichas; el historial se queda.
{
  const r = correr(`${ESCENA}
${GUARDAR_COMPLETA}
select count(*) from retail.fn_gastos_fijos_fichas() where gasto_fijo_id = :'f';
select retail.archivar_gasto_fijo(:'f');
select count(*) from retail.fn_gastos_fijos_fichas() where gasto_fijo_id = :'f';
select count(*) from retail.gastos_fijos_ficha_cambios where gasto_fijo_id = :'f';`);
  const [antes, , despues, hist] = lineas(r);
  esperar("el fijo activo está en la lista de fichas", r.ok && Number(antes) === 1, r);
  esperar("archivado, sale de la lista", r.ok && Number(despues) === 0, r);
  esperar("y su historial no se pierde", r.ok && Number(hist) === 9, r);
}

// 9. Los 9 proveedores de servicios (20261018004000): están, con el rubro «Gastos», y la lista de un fijo ya no mezcla mercadería.
{
  const r = correr(`${ESCENA}
insert into retail.proveedores (nombre, rubros) values ('Polos del Sur (prueba, mercadería)', array['Polos']) returning id as merca \\gset
select count(*) from retail.proveedores where 'Gastos' = any (rubros) and ruc in ('20331898008', '20269985900', '20132023540', '20100188628', '20100152356', '20131911310', '20100211034', '20100017491', '20467534026');
select count(*) from retail.proveedores where 'Gastos' = any (rubros) and id = :'merca';`);
  const [nueve, merca] = lineas(r);
  esperar("los 9 proveedores de luz, agua e internet están en la lista de gastos", r.ok && Number(nueve) === 9, r);
  esperar("un proveedor de mercadería no entra a esa lista", r.ok && Number(merca) === 0, r);
}

console.log(fallos ? `\n${fallos} caso(s) fallaron` : "\nTodo en orden");
process.exit(fallos ? 1 : 0);
