#!/usr/bin/env node
/**
 * Prueba de ADR-0261, tareas #3 y #4 (parte de la base): el Catálogo, su cabecera, «Dónde más hay» y la tarjeta por sede
 * dicen el MISMO número que la cifra única (`fn_existencias_base`), no la suma cruda de `stock`
 * (migración `20260929020000_catalogo_y_otras_sedes_leen_la_cifra_unica.sql`, encima de `20260929010000`).
 *
 * La escena (la misma de `fn_existencias.mjs`): BLU-EMMA-NEG-M en Tienda Trujillo con 5 en el piso (1 apartada), 3 en
 * el almacén y 2 en Cuarentena → 10 físicas y 7 disponibles. En Lima, 4 disponibles. Cada caso corre en su transacción
 * con las dos migraciones aplicadas dentro y TERMINA EN ROLLBACK.
 *
 * El control: sin la migración 2, `fn_productos` y `fn_stock_por_sede` vuelven a contar las dañadas y las apartadas
 * (prueba de que el caso mira lo que tiene que mirar).
 *
 * USO: pnpm pruebas:catalogo-cifra-unica   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const CIFRA = leer("20260929010000_fn_existencias_una_sola_cifra.sql");
const LECTURAS = leer("20260929020000_catalogo_y_otras_sedes_leen_la_cifra_unica.sql");

/** Un bloque `create … ;` copiado tal cual de una migración vieja: desde `inicio` hasta el primer `fin` que le sigue. */
function bloque(archivo, inicio, fin) {
  const sql = leer(archivo);
  const i = sql.indexOf(inicio);
  if (i < 0) throw new Error(`no encontré «${inicio}» en ${archivo}`);
  return sql.slice(i, sql.indexOf(fin, i) + fin.length);
}
/** El control: las tres lecturas como estaban ANTES (sus últimas migraciones), para probar que los casos miran lo que tienen que mirar. */
const ANTES = [
  bloque("20260924180000_varios_usuarios_lecturas_rapidas_y_cambio_en_orden.sql", "create or replace function retail.fn_productos(", "$function$;"),
  bloque("20260922120000_productos_alertas_solo_activas_y_variantes_distintas.sql", "CREATE OR REPLACE FUNCTION retail.fn_productos_resumen(", "$function$;"),
  bloque("20260922170000_alta_colaborador_requiere_aprobacion.sql", "create or replace function retail.fn_stock_por_sede()", "$$;"),
].join("\n");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

const ESCENA = `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as v, producto_id as prod from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select referencia as ref from retail.productos where id = :'prod' \\gset
-- Solo esta talla tiene stock en el producto: los números de la escena son los del producto entero.
delete from retail.stock where variante_id in (select id from retail.variantes where producto_id = :'prod');
insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada)
select :'v', :'ubic', sb.id,
       case sb.tipo when 'piso_venta' then 5 when 'almacen_tienda' then 3 else 2 end,
       case sb.tipo when 'piso_venta' then 1 else 0 end
from retail.sububicaciones sb where sb.ubicacion_id = :'ubic' and sb.tipo in ('piso_venta', 'almacen_tienda', 'cuarentena');
insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad)
select :'v', :'lima', sb.id, 4 from retail.sububicaciones sb where sb.ubicacion_id = :'lima' and sb.tipo = 'piso_venta';
set local request.jwt.claim.sub = '${FELIPE}';
`;

const dentro = (cuerpo, { conLecturas = true } = {}) =>
  psql(`begin;\n${CIFRA}\n${conLecturas ? LECTURAS : ANTES}\n${ESCENA}\n${cuerpo}\nrollback;`);

/** El «Stock total» que el Catálogo le pone a la tarjeta del producto de la escena. */
const STOCK_CATALOGO = `select distinct stock_total from retail.fn_productos(p_busqueda => :'ref', p_por_pagina => 100) where producto_id = :'prod';`;

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
const igual = (sql, esperado, opciones) => () => {
  const salida = dentro(sql, opciones);
  if (salida !== esperado) return `esperaba «${esperado}», salió «${salida}»`;
};

caso("Catálogo: «Stock total» es lo disponible de la red (7 en Trujillo + 4 en Lima = 11), no las 14 físicas", igual(STOCK_CATALOGO, "11"));

caso(
  "control: sin la migración, el Catálogo vuelve a contar dañadas y apartadas (14)",
  igual(STOCK_CATALOGO, "14", { conLecturas: false })
);

caso(
  "Catálogo = cifra única para TODOS los productos del seed (ninguno se queda con la suma cruda)",
  igual(
    `select count(*) from (
       select distinct producto_id, stock_total from retail.fn_productos(p_por_pagina => 100)
     ) c
     left join (
       select producto_id, sum(disponible) as d from retail.fn_existencias_base(null, null) where not talla_retirada group by 1
     ) e on e.producto_id = c.producto_id
     where c.stock_total <> coalesce(e.d, 0);`,
    "0"
  )
);

caso(
  "la cabecera cuenta «sin stock» con la misma cifra que la lista",
  igual(
    `select (select sin_stock from retail.fn_productos_resumen()) =
            (select count(distinct producto_id) from retail.fn_productos(p_stock => 'sin_stock', p_por_pagina => 100));`,
    "t"
  )
);

caso(
  "un producto de prueba no enciende «sin stock» ni en la lista ni en la cabecera",
  igual(
    `select sin_stock as antes from retail.fn_productos_resumen() \\gset
     update retail.stock set cantidad = 0, cantidad_apartada = 0 where variante_id in (select id from retail.variantes where producto_id = :'prod');
     select sin_stock as en_cero from retail.fn_productos_resumen() \\gset
     update retail.productos set es_prueba = true where id = :'prod';
     select concat_ws('|', :en_cero - :antes,
                           (select sin_stock from retail.fn_productos_resumen()) - :antes,
                           (select count(*) from retail.fn_productos(p_stock => 'sin_stock', p_por_pagina => 100) where producto_id = :'prod'));`,
    "1|0|0"
  )
);

caso(
  "«Dónde más hay» (fn_stock_por_sede) ofrece lo disponible: 7 en Trujillo, no 10",
  igual(`select cantidad from retail.fn_stock_por_sede() where variante_id = :'v' and ubicacion_id = :'ubic';`, "7")
);

caso(
  "control: sin la migración, «Dónde más hay» ofrecía las 10 físicas (con dañadas y apartadas)",
  igual(`select cantidad from retail.fn_stock_por_sede() where variante_id = :'v' and ubicacion_id = :'ubic';`, "10", { conLecturas: false })
);

caso(
  "la tarjeta por sede, vista desde Trujillo: 7 aquí (1 apartada, 2 dañadas), +4 en Lima, 0 en el Taller",
  igual(
    `select concat_ws('|', aqui, apartado_aqui, danado_aqui, en_camino_aqui, en_otras_tiendas, en_taller,
                      (otras->0->>'sede'), (otras->0->>'disponible'), jsonb_array_length(otras), en_tallas_retiradas)
     from retail.fn_existencias_productos(array[:'prod']::uuid[], :'ubic');`,
    "7|1|2|0|4|0|Tienda Lima|4|1|0"
  )
);

caso(
  "la misma tarjeta vista desde Lima: 4 aquí y +7 en Trujillo (el selector de sede cambia solo los números)",
  igual(
    `select concat_ws('|', aqui, en_otras_tiendas, (otras->0->>'sede'))
     from retail.fn_existencias_productos(array[:'prod']::uuid[], :'lima');`,
    "4|7|Tienda Trujillo"
  )
);

caso(
  "el Taller va aparte: 6 terminadas en el Taller no suman a «otras tiendas»",
  igual(
    `select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
     insert into retail.stock (variante_id, ubicacion_id, cantidad) values (:'v', :'taller', 6);
     select concat_ws('|', en_otras_tiendas, en_taller) from retail.fn_existencias_productos(array[:'prod']::uuid[], :'ubic');`,
    "4|6"
  )
);

caso(
  "lo que viene en camino hacia Trujillo se ve aparte, sin sumar a «aquí»",
  igual(
    `insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado)
       values (:'lima', :'ubic', 'en_transito') returning id as t \\gset
     insert into retail.transferencia_items (transferencia_id, variante_id, cantidad) values (:'t', :'v', 3);
     select concat_ws('|', aqui, en_camino_aqui) from retail.fn_existencias_productos(array[:'prod']::uuid[], :'ubic');`,
    "7|3"
  )
);

caso(
  "una talla retirada con unidades no suma a nada que se venda: sale como aviso aparte (14 físicas en la red)",
  igual(
    `${RETIRADA_A_LA_FUERZA}
     select concat_ws('|', aqui, en_otras_tiendas, en_tallas_retiradas,
                      (select count(*) from retail.fn_stock_por_sede() where variante_id = :'v'))
     from retail.fn_existencias_productos(array[:'prod']::uuid[], :'ubic');`,
    "0|0|14|0"
  )
);

caso(
  "sin una cuenta de colaborador activa, la tarjeta y «Dónde más hay» no devuelven nada",
  igual(
    `set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000000';
     select concat_ws('|', (select count(*) from retail.fn_existencias_productos(array[:'prod']::uuid[], :'ubic')),
                           (select count(*) from retail.fn_stock_por_sede()));`,
    "0|0"
  )
);

caso(
  "anon no llama la tarjeta por sede; authenticated sí",
  igual(
    `select concat_ws('|', has_function_privilege('anon', 'retail.fn_existencias_productos(uuid[], uuid)', 'execute'),
                           has_function_privilege('authenticated', 'retail.fn_existencias_productos(uuid[], uuid)', 'execute'));`,
    "f|t"
  )
);

console.log(`\n${total - fallas}/${total} casos`);
process.exit(fallas ? 1 : 0);
