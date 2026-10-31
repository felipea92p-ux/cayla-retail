/**
 * El mediodía de HOY en Lima, como instante de Postgres, para sembrar «lo de hoy» en una prueba. Con `now() - interval '2 hours'` la venta de «hoy»
 * cae en el día anterior si la prueba corre entre las 00:00 y las 02:59 de Lima (el CI de las 05:00 UTC): todo lo que suma «hoy» sale mal y la
 * prueba falla sin que nada esté roto. Desde el mediodía, «tres horas antes» y «un día antes» siguen en el día que la prueba espera, a cualquier hora.
 * Puede quedar en el futuro (antes de las 12:00): sirve para las funciones que cortan por la fecha de Lima, no para una que compare contra `now()`.
 */
export const MEDIODIA_LIMA = `(((now() at time zone 'America/Lima')::date + time '12:00') at time zone 'America/Lima')`;
