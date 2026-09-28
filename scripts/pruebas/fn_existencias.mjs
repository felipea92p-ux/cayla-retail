#!/usr/bin/env node
/**
 * Prueba de ADR-0256, tarea #2: `retail.fn_existencias` es LA cifra de stock
 * (migración `20260929010000_fn_existencias_una_sola_cifra.sql`).
 *
 * La escena: en Tienda Trujillo, BLU-EMMA-NEG-M recibe 5 en el piso, 3 en el almacén y 2 en Cuarentena; una clienta
 * aparta 1. Cada caso corre en su transacción, con la migración aplicada dentro, y TERMINA EN ROLLBACK: el Postgres
 * local compartido no cambia.
 *
 * Lo que se prueba es el contrato, no la implementación:
 *   disponible = físico − dañado − apartado = piso libre + almacén libre + sin lugar, en TODA fila;
 *   la Cuarentena y lo apartado no se ofrecen; las pruebas y el «Monto manual» no cuentan;
 *   una talla retirada con unidades se ve (no desaparece); sin unidades, no;
 *   «en camino» es solo lo `en_transito` hacia esa sede; sin cuenta activa, nada.
 *
 * USO: pnpm pruebas:fn-existencias   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20260929010000_fn_existencias_una_sola_cifra.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

/** Deja `:ubic`, `:lima`, `:v`, `:prod` y stock conocido de BLU-EMMA-NEG-M en Trujillo: 5 piso, 3 almacén, 2 cuarentena, 1 apartada. */
const ESCENA = `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as v, producto_id as prod from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
-- Borrón de lo que el seed ya tenga de esa talla en Trujillo y en Lima, para que los números sean los de la escena
-- (en Lima queda sin fila: lo que llegue «en camino» tiene que aparecer igual).
delete from retail.stock where variante_id = :'v' and ubicacion_id in (:'ubic', :'lima');
insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada)
select :'v', :'ubic', sb.id,
       case sb.tipo when 'piso_venta' then 5 when 'almacen_tienda' then 3 else 2 end,
       case sb.tipo when 'piso_venta' then 1 else 0 end
from retail.sububicaciones sb where sb.ubicacion_id = :'ubic' and sb.tipo in ('piso_venta', 'almacen_tienda', 'cuarentena');
set local request.jwt.claim.sub = '${FELIPE}';
`;

const dentro = (cuerpo) => psql(`begin;\n${MIGRACION}\n${ESCENA}\n${cuerpo}\nrollback;`);

/** La fila de la escena, como «fisico|danado|apartado|disponible|piso|almacen|sin_lugar|en_camino|retirada». */
const FILA = (donde = ":'ubic'") => `
select concat_ws('|', fisico, danado, apartado, disponible, piso_libre, almacen_libre, sin_lugar, en_camino, talla_retirada)
from retail.fn_existencias(${donde}) where variante_id = :'v';`;

/** Una talla retirada CON prendas: el estado viejo que ya no se puede producir (20260929030000 lo rechaza) pero que existe
 *  en producción desde antes. Se arma sin disparadores, solo dentro de esta transacción. */
const RETIRADA_A_LA_FUERZA = `set local session_replication_role = replica;
update retail.variantes set activo = false where id = :'v';
set local session_replication_role = origin;`;

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
const igual = (sql, esperado) => () => {
  const salida = dentro(sql);
  if (salida !== esperado) return `esperaba «${esperado}», salió «${salida}»`;
};

caso(
  "la escena: 10 físicas, 2 dañadas, 1 apartada → 7 disponibles (4 piso + 3 almacén)",
  igual(FILA(), "10|2|1|7|4|3|0|0|f")
);

caso(
  "sin argumento es toda la red, y da la misma fila para Trujillo",
  igual(`select count(*) from retail.fn_existencias() where variante_id = :'v' and ubicacion_id = :'ubic' and disponible = 7;`, "1")
);

caso(
  "el contrato vale en TODAS las filas del seed, no solo en la escena",
  igual(
    `select count(*) from retail.fn_existencias()
     where disponible <> greatest(fisico - danado - apartado, 0)
        or disponible <> piso_libre + almacen_libre + sin_lugar
        or disponible < 0;`,
    "0"
  )
);

caso(
  "el físico es exactamente la suma de `stock` (sin pruebas ni «Monto manual»), sede por sede",
  igual(
    `select count(*) from (
       select s.variante_id, s.ubicacion_id, sum(s.cantidad) as crudo
       from retail.stock s join retail.variantes va on va.id = s.variante_id join retail.productos p on p.id = va.producto_id
       where not p.es_prueba and p.id <> '11111111-1111-4111-8111-111111111111' and (va.activo or s.cantidad <> 0)
       group by 1, 2
     ) c
     full join retail.fn_existencias() f on f.variante_id = c.variante_id and f.ubicacion_id = c.ubicacion_id
     where coalesce(c.crudo, 0) <> coalesce(f.fisico, 0)
       and not (c.variante_id is null and f.en_camino > 0);`,
    "0"
  )
);

caso(
  "una prenda sin sububicación (la repone `anular_venta`) cuenta como disponible «sin lugar»",
  igual(
    `insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad) values (:'v', :'ubic', null, 4);
     ${FILA()}`,
    "14|2|1|11|4|3|4|0|f"
  )
);

caso(
  "un producto de prueba no aparece en ninguna cifra",
  igual(`update retail.productos set es_prueba = true where id = :'prod'; select count(*) from retail.fn_existencias() where producto_id = :'prod';`, "0")
);

caso(
  "una talla retirada CON unidades se ve, marcada (no desaparece como pasaba en Existencias)",
  igual(`${RETIRADA_A_LA_FUERZA} ${FILA()}`, "10|2|1|7|4|3|0|0|t")
);

caso(
  "una talla retirada SIN unidades no aparece",
  igual(
    `update retail.stock set cantidad = 0, cantidad_apartada = 0 where variante_id = :'v';
     update retail.variantes set activo = false where id = :'v';
     select count(*) from retail.fn_existencias() where variante_id = :'v';`,
    "0"
  )
);

caso(
  "una talla activa en 0 SÍ aparece (Existencias muestra las filas en 0 de una tienda)",
  igual(
    `update retail.stock set cantidad = 0, cantidad_apartada = 0 where variante_id = :'v' and ubicacion_id = :'ubic'; ${FILA()}`,
    "0|0|0|0|0|0|0|0|f"
  )
);

const TRASLADO = (estado) => `
insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado)
  values (:'ubic', :'lima', 'en_transito') returning id as t \\gset
insert into retail.transferencia_items (transferencia_id, variante_id, cantidad) values (:'t', :'v', 6);
${estado === "en_transito" ? "" : `update retail.transferencias set estado = '${estado}' where id = :'t';`}`;

caso(
  "en camino: 6 enviadas a Lima figuran en Lima aunque Lima no tenga fila de stock (y Trujillo no cambia)",
  igual(`${TRASLADO("en_transito")} ${FILA(":'lima'")} ${FILA()}`, "0|0|0|0|0|0|0|6|f\n10|2|1|7|4|3|0|0|f")
);

caso(
  "un traslado ya recibido con diferencia NO sigue «en camino» (Existencias lo contaba dos veces)",
  igual(`${TRASLADO("recibido_con_diferencia")} select count(*) from retail.fn_existencias(:'lima') where variante_id = :'v' and en_camino > 0;`, "0")
);

caso(
  "la pieza «Monto manual» nunca aparece",
  igual(
    `select count(*) from retail.fn_existencias() f join retail.variantes va on va.id = f.variante_id
     where va.producto_id = '11111111-1111-4111-8111-111111111111' or f.variante_id = '22222222-2222-4222-8222-222222222222';`,
    "0"
  )
);

caso(
  "sin una cuenta de colaborador activa devuelve 0 filas, no un error",
  igual(`reset request.jwt.claim.sub; set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000000'; select count(*) from retail.fn_existencias();`, "0")
);

caso(
  "anon no la puede llamar; authenticated sí; la fórmula sin candado (`fn_existencias_base`) nadie desde fuera",
  igual(
    `select concat_ws('|', has_function_privilege('anon', 'retail.fn_existencias(uuid, uuid[])', 'execute'),
                           has_function_privilege('authenticated', 'retail.fn_existencias(uuid, uuid[])', 'execute'),
                           has_function_privilege('authenticated', 'retail.fn_existencias_base(uuid, uuid[])', 'execute'),
                           has_function_privilege('anon', 'retail.fn_existencias_base(uuid, uuid[])', 'execute'));`,
    "f|t|f|f"
  )
);

caso(
  "con `p_producto_ids` solo vienen esos productos, con los mismos números que sin filtro",
  igual(
    `select count(*) from retail.fn_existencias(null, array[:'prod']::uuid[]) f
     where f.producto_id <> :'prod'
        or not exists (select 1 from retail.fn_existencias() g
                       where g.variante_id = f.variante_id and g.ubicacion_id = f.ubicacion_id
                         and g.disponible = f.disponible and g.en_camino = f.en_camino);`,
    "0"
  )
);

console.log(`\n${total - fallas}/${total} casos`);
process.exit(fallas ? 1 : 0);
