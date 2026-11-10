# ADR-0638 — El Yape de Claudia sale de los números de CAYLA (enmienda al ADR-0560)

- **Fecha:** 2026-11-09 · **Estado:** construido en la rama `claude/lima-yape-fuera-de-cayla` (actividad 2 de la obra de Lima); las migraciones `20261110001000`, `20261110002000` y `20261110003000` están **por pegar** en producción. Las actividades siguientes de la obra amplían este mismo ADR.
- **Decide:** Felipe Alvarez (9-nov-2026, una por una).
- **Enmienda:** ADR-0560, puntos 1, 2 y 4 de «Lo que se decidió» y la línea de «IGV» de su segunda ronda (la de `20261029142000`). Esas migraciones no se editan: se enmiendan desde aquí.
- **Relacionados:** ADR-0463 y ADR-0505 (CAYLA y CLAURE, dos empresas; CLAURE solo en Lima), ADR-0560 (la cuenta con Claudia), ADR-0429 (máquinas), ADR-0288 (lo que el SQL Editor agrega al pegar).

## El problema

El ADR-0560 partió de un supuesto: que todo Yape de Tienda LIM caía en una cuenta de CAYLA. No es así. El número que se le da a una cliente que compra algo de CLAURE es el de Claudia: esa plata llega directo a ella. El sistema lo anotaba igual en BCP Empresa, y de ahí salían dos errores a la vez: un banco de CAYLA que decía tener plata que nunca recibió, y una deuda con Claudia por plata que ya tenía ella.

## Las reglas de Lima (Felipe, 9-nov)

Solo valen en Tienda LIM; Trujillo y Arequipa siguen igual.

1. **Lo de CLAURE por Yape o Plin se paga al número de Claudia**, fuera de CAYLA. Lo de CAYLA por Yape o Plin va al QR de Izipay o al número de CAYLA. La cuenta la decide el dueño del ticket, no solo la sede.
2. **Se le lleva la cuenta, pero no es parte de los balances de CAYLA.** Por eso existe la cuenta «Yape de Claudia · LIM» y por eso no suma en ningún lado.
3. **A dónde apunta cada medio de cobro no cambia:** el Yape y el Plin de Lima siguen apuntando a BCP Empresa, y lo de CAYLA queda exactamente como está. La excepción la pone el dueño de la prenda (actividad siguiente).
4. **Un ticket con las dos marcas se cobra en dos pagos.** Si la cliente pagó todo a un solo número, se anota lo que pasó: es una guía, no un candado.
5. **CAYLA asume el IGV de todo lo de CLAURE**, también de lo vendido por Yape y en efectivo: ya no se le descuenta a Claudia. Se lleva una línea acumulada de ese IGV contra las facturas de compra que lo cubran.
6. **La plata de CAYLA que llegó por error al número de Claudia se descuenta** de lo que se le debe.
7. **Cada una devuelve lo suyo** (Claudia desde su Yape; CAYLA del cajón o de su número).
8. **Claudia sigue cerrando la caja de Lima,** con un estado de cuenta que ve Felipe, y los ajustes los hace solo él.

Lo que cambia de cifras por las reglas 4 a 8 llega en las actividades siguientes; aquí no se toca ninguna (ni el IGV).

## Lo que se decidió en esta actividad

- **DECIDÍ una cuenta de la empresa CLAURE, tipo `banco`, con la contable 104, saldo 0, sin fecha de arranque y sin número** (el repositorio es público). Una cuenta de un tipo nuevo se habría colado por todos los `not in` de la base.
- **DECIDÍ que la cuenta nazca al final, como interruptor** (`20261110003000`). Antes de ella se ponen el filtro y los candados (`20261110001000`) y el asiento del Diario (`20261110002000`): con ninguna cuenta ajena, nada de eso cambia una sola cifra.
- **DECIDÍ una sola pregunta, `fn_cuenta_es_de_casa`,** y un `where` en el libro (`fn_dinero_libro`), que heredan sus 22 lectores. A eso se suman las tres listas que leen la tabla directo (saldos, conciliación, cierre de mes) y el conteo de bancos del medidor de confianza.
- **DECIDÍ un contraasiento (`claure_fuera`) dentro de `fn_asientos_claure`, y no tocar `fn_asientos`.** El cuerpo grande del Diario sigue asentando cada cobro por su medio; el contraasiento lo cancela exacto: 479 al debe (Claudia ya la tiene) y la cuenta del medio al haber (no entró a CAYLA).
- **DECIDÍ que `empresa_id` no cambie nunca** y que una cuenta ajena sea siempre `banco`, con saldo 0 y sin `saldo_desde` (`fn_cuentas_dinero_inmutable`). Así «saldo inicial + libro» da 0 en cualquier suma, presente o futura.
- **DECIDÍ que una cuenta ajena solo cobre Yape o Plin en una sede de su empresa.** Es lo que usa la actividad siguiente para mover ahí pagos ya registrados, con `corregir_pagos_venta` y cuenta explícita. No paga gastos, compras ni activos, y no entra a ningún movimiento de CAYLA.
- **DESCARTÉ filtrar solo los combos.** Una RPC llamada directo seguiría guardando la cuenta, y el error saldría después o nunca: el libro la esconde y el Diario la pone en la 104.
- **DESCARTÉ renombrar el cuerpo del libro a una versión «completa».** Nadie necesita las líneas ajenas del libro; lo que entró a la cuenta ajena se lee de los cobros sellados (`fn_claure_fuera`).
- **DESCARTÉ excluir los cobros ajenos dentro de `fn_asientos`:** 36 mil caracteres y muchas suites con huella, para hacer lo mismo que un contraasiento local.

## Qué significa

- Lo que cae en esa cuenta **no está** en «Tienes», en Saldos, en el Flujo, en la Conciliación, en el Balance ni en el medidor de confianza, y no se puede elegir en ninguna lista.
- Se ve aparte, y con esta etiqueta: «De CLAURE, no suma»: una nota en Finanzas ▸ Dónde está, el bloque «Su Yape» en la pestaña CLAURE y una fila de solo lectura en Configuración ▸ Dinero.
- El día que se pega, **ninguna cifra cambia**: la cuenta nace vacía.

## Cómo queda enmendado el ADR-0560

| ADR-0560 | Queda |
|---|---|
| Punto 1: «la cuenta destino manda: el Yape de Lima cae en BCP Empresa» | La cuenta destino sigue mandando, pero lo de CLAURE por Yape o Plin cae en la cuenta de Claudia, que no es de CAYLA |
| Punto 2 y línea del IGV de la segunda ronda: el IGV se le descuenta | Ya no se le descuenta (regla 5). Se aplica en la actividad siguiente que toca la fórmula; hasta entonces sigue la regla vieja |
| Punto 4: «El efectivo no cuenta» en un cambio | Cambia con la cuenta única con Claudia (actividad 4 de la obra) |

## SE ROMPE SI

- La parte 3 (la cuenta) se pega antes que las partes 1 y 2: un cobro sale del libro y sigue en la 104, o un gasto sale de ella y se vuelve invisible.
- Aparece otra marca con cuenta propia: `fn_claure_fuera` la tomaría como de Claudia, porque la 479 es de CLAURE.
- Una tabla nueva con llave a `cuentas_dinero` no decide si puede o no tener una cuenta ajena: la suite falla a propósito hasta que se decida.

## Cómo se verifica

`pnpm pruebas:fuera-de-cayla` (con la cuenta vacía todo da idéntico; un Yape puesto ahí sale de BCP, de los saldos, del Flujo y del Balance y el Diario cuadra; nadie paga nada con ella; no aparece en ninguna lista; un cobro Yape o Plin en su sede sí se puede), con sus controles (sin cada parche, se rompe) y el censo de las columnas con llave a `cuentas_dinero`. En producción, las cinco huellas del encabezado de `20261110001000`, antes y después, tienen que salir iguales.
