/**
 * Las dos prendas de las pruebas de CLAURE: A (de CLAURE) y B (de CAYLA), CREADAS dentro de la transacción de cada caso.
 *
 * POR QUÉ NACEN AQUÍ (2026-10-30). Antes cada prueba TOMABA PRESTADA la primera prenda que encontraba
 * (`select va.id, va.producto_id from retail.variantes va order by va.id limit 1`) y le cambiaba el dueño a CLAURE. Dos cosas
 * chocaban: (1) el seed le pone a cada variante un id AL AZAR (`variantes.id default gen_random_uuid()`), así que «la primera»
 * es una prenda distinta en cada base del CI —cada tanda levanta la suya—; y (2) el propio seed deja, con fecha de HOY, 3 ventas,
 * 1 cambio y 1 devolución aprobada con una prenda dañada, repartidas sobre 5 de sus 11 prendas (28 de sus 49 variantes). Cuando
 * el sorteo caía en una de esas prendas, su historia pasaba a ser «de CLAURE» y se sumaba a lo que la prueba medía: el CI se
 * ponía rojo en una suite distinta en cada corrida, sin que el PR tuviera nada que ver (medido: 10/49 sorteos rompían
 * `claure_cuenta`, 14/49 `claure_perdidas_y_danadas` y 16/49 `claure_fuera_de_las_cifras`).
 *
 * UNA PRENDA CREADA DENTRO DE LA TRANSACCIÓN NO PUEDE TENER HISTORIA, por construcción: no hay lista de tablas que recordar
 * (ventas, cambios, devoluciones, apartados, movimientos…) ni sorteo del que depender. Copia sus atributos (categoría, tejido,
 * patrón, marca, proveedor, temporada, color, talla, precio y costo) de una prenda real, así que para las funciones que se
 * miden sigue siendo una prenda como cualquier otra; lo único que cambia es que es NUEVA.
 *
 * USO: el SQL va DENTRO de la escena, después de `set local session_replication_role = replica` (nace sin disparadores, como
 * el resto de la escena) y deja puestas las variables de psql `:'p_a'`, `:'p_b'`, `:'va_a'` y `:'va_b'`, con los mismos
 * nombres que usaban las escenas. Todo termina en ROLLBACK, igual que antes.
 */

// Ids fijos, fuera del espacio que usan las escenas para sus ventas y movimientos (`…-0000000000XX`).
const P_A = "00000000-0000-4000-8000-00000000fa01";
const P_B = "00000000-0000-4000-8000-00000000fb01";
const VA_A = "00000000-0000-4000-8000-00000000fa02";
const VA_B = "00000000-0000-4000-8000-00000000fb02";

/**
 * El SQL que crea la prenda A (de `claure`) y la prenda B (de `cayla`), cada una con una variante. `claure` y `cayla` son los
 * ids de las empresas tal como los escribe la prueba (entre comillas simples).
 */
export function sqlPrendasDePrueba({ claure, cayla }) {
  return `
-- Las prendas de la prueba NACEN aquí (ver scripts/pruebas/_prendas_de_prueba.mjs): una prenda del seed arrastraría sus ventas, cambios y devoluciones de hoy.
select producto_id as plantilla_p, id as plantilla_v from retail.variantes order by id limit 1 \\gset
\\set p_a '${P_A}'
\\set p_b '${P_B}'
\\set va_a '${VA_A}'
\\set va_b '${VA_B}'
insert into retail.productos (id, categoria_id, referencia, descripcion, codigo, tejido_id, patron_id, marca_id, proveedor_id, temporada, empresa_id)
select n.id, p.categoria_id, n.referencia, p.descripcion, n.codigo, p.tejido_id, p.patron_id, p.marca_id, p.proveedor_id, p.temporada, n.empresa_id
  from retail.productos p
 cross join (values (:'p_a'::uuid, 'ZZ prueba CLAURE', 'ZZPA-0001', ${claure}::uuid),
                    (:'p_b'::uuid, 'ZZ prueba CAYLA', 'ZZPB-0001', ${cayla}::uuid)) as n(id, referencia, codigo, empresa_id)
 where p.id = :'plantilla_p';
insert into retail.variantes (id, producto_id, color_codigo, sku, precio, costo, talla_id)
select n.id, n.producto_id, va.color_codigo, n.sku, va.precio, va.costo, va.talla_id
  from retail.variantes va
 cross join (values (:'va_a'::uuid, :'p_a'::uuid, 'ZZPA-0001-U'), (:'va_b'::uuid, :'p_b'::uuid, 'ZZPB-0001-U')) as n(id, producto_id, sku)
 where va.id = :'plantilla_v';
`;
}
