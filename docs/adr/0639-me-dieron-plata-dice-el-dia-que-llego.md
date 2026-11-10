# ADR-0639 — «Me dieron plata» dice el día en que la plata llegó

- **Fecha:** 2026-11-09 · **Estado:** construido en la rama `claude/compra-anterior-dinero-procesado-445588`; la migración `20261110025000` está **por pegar** en producción.
- **Decide:** Felipe Alvarez (9-nov-2026): «era una compra anterior que ya el dinero había salido».
- **Relacionados:** ADR-0480 (Compras simple, la plata anotada), ADR-0574 (la plata anotada entra sola a su fondo), ADR-0136 (movimiento de las hojas).

## El problema

La compradora anota «Me dieron plata» y la anotación nace con la fecha de **hoy**. Una transferencia con el banco indicado entra sola a su fondo
(`fn_plata_confirmar_sola`) con esa misma fecha, y el libro del banco la resta hoy. Si la transferencia había salido días antes —una compra anterior
cuya plata ya había salido, y el saldo de esa cuenta ya la había descontado—, el banco del ERP queda por debajo del real. Pasó el 9-nov con S/ 1,580
de BCP Operativa al fondo de Lizzelott Ramírez. Y como esa plata **entra sola**, no hay un paso de confirmación donde alguien corrija la fecha; y un
fondo ya confirmado de plata anotada no se anula.

## Lo que se decidió

- **DECIDÍ que la fecha se dice al anotar**, en la hoja «Me dieron plata»: «Llegó hoy, 9 nov · Cambiar el día», con un calendario que va de hoy hacia
  atrás hasta 120 días. Sin tocarlo, todo sigue igual y no viaja nada nuevo a la base.
- **DECIDÍ que `anotar_plata_compras` reciba un `p_fecha` opcional** (`20261110025000`): la anotación, el movimiento del fondo y el libro del banco nacen
  con ese día; la plata que se confirma a mano después (Yape, efectivo) toma el de la anotación. Futuro, de hace más de 120 días o junto con «ya tenía»
  (que fija con cuánto empieza el fondo y no lleva día) se rechazan con `fecha_invalida`. El día entra a la huella del token solo si se dijo.
- **DESCARTÉ poner la fecha en «Confirmar la plata»:** la plata de una transferencia con banco ya no pasa por ahí (entra sola), así que el cambio no
  habría arreglado el caso real.
- **DESCARTÉ el interruptor «ya había salido, no descuentes del banco»:** dos formas de decir lo mismo y una puerta a plata que aparece en un fondo sin
  origen. Una fecha anterior al arranque de la cuenta (`saldo_desde`) ya consigue que el banco no la vuelva a restar, con el mismo libro de siempre.
- **DESCARTÉ anular el movimiento ya hecho:** un fondo confirmado es inmutable (`anular_movimiento_fondo` lo bloquea). La fila de Lizzelott se corrige
  con un aporte compensatorio a BCP Operativa, a mano, con el OK de Felipe.

## SE ROMPE SI

- Se anota con un día antes del arranque de una cuenta y la persona esperaba verlo restado: no se resta, a propósito (la cuenta ya empezó con el saldo real).
- Quien anota pone un día que no es: no hay quién lo verifique contra el extracto (antes tampoco: la plata de una transferencia con banco entraba sola).

## Qué se tocó

`supabase/migrations/20261110025000_anotar_plata_con_el_dia_que_llego.sql` (suelta la firma de 5 argumentos y crea la de 6),
`apps/web/components/mi-plata/AnotarPlata.tsx`, `apps/web/lib/mi-plata-reglas.ts` (`limitesDeLlegada`, `diaDeLlegadaAMandar`), `mi-plata-acciones.ts`,
la guía `compras.mi-plata` (paso «¿Qué día te llegó?») y la prueba `scripts/pruebas/compras_simple_plata.mjs` (6 casos nuevos; las suites que pegan
migraciones viejas rebobinan con `scripts/pruebas/rebobinar_anotar_plata.sql`).

**Esto cambia el diseño de Dynamic:** no (no toca `recetas.css` ni `components/ui/`).
