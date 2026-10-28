// La migración «el Taller tiene su cuenta de pago por defecto» (20261028065000, ADR-0553) parcha por ancla la función viva
// `fn_produccion_pagos_sellar`: el sello de un pago del Taller deja de preguntarle a `fn_cuenta_sellada` por una sede NULA y le pasa la
// sede del Taller. Las pruebas que vuelven a pegar la migración VIEJA de esa función (20261015034000, el pago de la orden de insumos al
// contado: `pruebas:comprobante-orden-insumo` y `pruebas:recepcion-orden-insumo`) corren sobre una base que ya tiene este parche encima, y
// el reemplazo anclado de aquella migración aborta con «cambió desde que se escribió esta migración» (su ancla —la línea con la sede
// nula— ya no está y su texto nuevo tampoco).
//
// Para probar la migración vieja sobre SU punto de partida, este texto devuelve `fn_produccion_pagos_sellar` a como estaba antes (el
// reemplazo se deshace; si la base no lo tiene, `replace` no cambia nada y la función se recrea igual). SOLO va dentro de una transacción
// que se deshace, o seguido de la migración nueva si se quiere probar el estado final. Es la pareja de `sello-antes-de-maquinas.mjs`.
//
// Las otras cuatro funciones que parcha 20261028065000 (guardar_medio_de_cobro, fn_medios_de_cobro, fn_medios_de_cobro_validar,
// fn_cuenta_dinero_detalle) no las toca ninguna migración que esas pruebas peguen: no hace falta deshacerlas. Un parche nuevo a
// `fn_produccion_pagos_sellar` posterior a este se suma en un módulo hermano y en esas dos pruebas.
import { readFileSync } from "node:fs";

// La ruta sale de este archivo, no de la carpeta desde donde se corra (las pruebas hermanas también funcionan desde cualquier carpeta).
const TALLER = readFileSync(new URL("../../supabase/migrations/20261028065000_taller_cuenta_de_pago_por_defecto.sql", import.meta.url), "utf8");
/** Cada `select pg_temp.reemplazar('<firma>', $v$ viejo $v$, $n$ nuevo $n$, 1);` del archivo, en el orden en que se aplican. */
const REEMPLAZOS = [...TALLER.matchAll(/select pg_temp\.reemplazar\('(retail\.[a-z_]+\([^)]*\))',\s*\$v\$([\s\S]*?)\$v\$,\s*\$n\$([\s\S]*?)\$n\$,\s*1\);/g)]
  .map((m) => ({ firma: m[1], viejo: m[2], nuevo: m[3] }));
if (REEMPLAZOS.length !== 7) {
  throw new Error(`sello-taller-antes-de-cuenta: esperaba 7 reemplazos anclados en 20261028065000 y encontré ${REEMPLAZOS.length}`);
}
const SELLO = REEMPLAZOS.filter((r) => r.firma === "retail.fn_produccion_pagos_sellar()");
if (SELLO.length !== 1) {
  throw new Error(`sello-taller-antes-de-cuenta: esperaba 1 reemplazo de fn_produccion_pagos_sellar y encontré ${SELLO.length}`);
}

/** `fn_produccion_pagos_sellar` como estaba antes del Taller con cuenta por defecto. */
export const DESHACER_TALLER_SELLO =
  SELLO.map((r) => `do $deshacer$ begin execute replace(pg_get_functiondef('${r.firma}'::regprocedure), $q$${r.nuevo}$q$, $q$${r.viejo}$q$); end $deshacer$;`).join("\n") + "\n";

