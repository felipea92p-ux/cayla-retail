# ADR-0667 — Reportes de ventas: «CAYLA y CLAURE», las dos empresas de una tienda lado a lado, con la cuenta donde entró cada cobro

- **Fecha:** 2026-11-15 · **Estado:** construido y probado en local (base privada con ventas inventadas de Lima; pruebas puras en verde). La migración
  `20261115042000` **está en producción desde el 2026-11-15** (la pegó Felipe; md5 igual al del repo; leída con la sesión de una líder da las mismas cifras al
  céntimo, ver «Cómo se verificó»).
- **Pidió:** Felipe, 2026-11-15, tras analizar el Excel «Ventas-Claure-2026-10-24-al-2026-11-14»: una vista «en ventas historia» para ver las ventas de
  Tienda LIM separando lo de CLAURE y lo de CAYLA, por mes y por período, por medio de pago, con la cuenta donde entró cada cobro, cuántas ventas, prendas y
  mixtas, boleta frente a nota de venta, y bajar del total a la venta y a la prenda.
- **Sigue a:** ADR-0665 (el filtro «Empresa» en Reportes y `fn_pago_de_la_empresa`), ADR-0560 (la cuenta con CLAURE), ADR-0542 (de quién es cada línea),
  ADR-0429 (la máquina del POS y su banco).

## El problema

La tarjeta de CLAURE cae a Interbank Empresas mezclada con la de CAYLA (vía «Por depositar Izipay»), su Yape cae al BCP de CAYLA y su efectivo queda en el
cajón de Lima. Reportes filtraba una empresa a la vez y la cuenta con CLAURE (Finanzas) decía cuánto se le debe, pero ninguna pantalla mostraba las dos
empresas juntas, en qué cuenta entró cada sol, ni cada venta con sus prendas.

## Decisión

Se le mostraron a Felipe tres lugares, con maqueta y las cifras reales: **A** una tercera pestaña en Ventas ▸ Reportes, **B** el filtro en Historial,
**C** una sección en Finanzas ▸ Cuentas y dinero ▸ CLAURE. **Eligió A** (2026-11-15).

| Pieza | Qué decide | Dónde |
|---|---|---|
| Dónde vive | Tercera pestaña de Reportes, `/vender/reportes/empresas`. No es un módulo (ADR-0306): la ve quien ve Reportes (`reportes_ventas`). La pestaña solo se dibuja si la cuenta ve una tienda con dos empresas (`fn_empresas_de_sede`), y su nombre son esas empresas («CAYLA y CLAURE»). | `CabeceraReportes`, `lib/reportes-por-empresa.ts` |
| El período | Un mes (`SelectorMes`), «desde que llegó CLAURE» (`empresas.cuenta_corriente_desde`, que la base resuelve porque la web no puede leer `empresas`) o dos fechas. Tope de 186 días. En la URL. | `periodoDeUrl`, `hrefPorEmpresa` |
| La lectura | **Una** RPC por pantalla, `fn_reporte_ventas_por_empresa(desde, hasta, tienda)`, que entrega las ventas **fila por fila**: comprobante, prendas con su empresa y pagos por medio con la cuenta, su tipo, si es de la casa, el banco al que abona su máquina y la parte de cada empresa. La web solo suma: toda cifra sale de las mismas filas que se ven al bajar al detalle. | `20261115042000`, `lib/reportes-por-empresa-reglas.ts` |
| Por qué `security definer` | La cuenta de un cobro sin cuenta escrita (`fn_cuenta_de_cobro`) y la comisión (`fn_pos_comision_estimada`) están cerradas a `authenticated`. La función pregunta ella misma `reportes_ventas` y `fn_puede_operar_ubicacion` antes de leer. Es una llamada por pantalla, no una por fila (ADR-0622). | migración |
| De quién es cada sol | Las reglas que ya existen, sin una nueva: la línea con `fn_empresa_de_la_linea`; cada pago con `fn_pago_de_la_empresa` (exacto salvo en la venta mixta pagada con dos medios, donde reparte por lo cobrado). | — |
| «¿Dónde está la plata?» | Cuenta × medio × empresa, en el orden en que se mueve la plata: cajón, bancos, por depositar (con «→ Interbank Empresas»). Debajo: lo de CLAURE que entró a cuentas de CAYLA (Yape, tarjeta, QR; el efectivo no, lo administra Claudia) y la comisión estimada del POS que asume ella, con la regla de `fn_claure_filas`. | `plataPorCuenta`, `cobradoEnCuentasDeLaCasa` |
| Lado a lado | Cada empresa: cómo le pagaron (`BarraApilada`) y mes a mes con ventas, prendas, boleta y nota de venta. Una venta mixta cuenta en las dos (es UN comprobante). | `ladoALado` |
| Venta por venta | La lista filtrable (empresa, medio, cuenta, comprobante, solo mixtas); tocar una fila de la plata la filtra. Cada venta se abre en sus prendas y lleva a Historial por su número de comprobante. Filtra en el navegador: ~100 ventas al mes. | `DetallePorEmpresa`, `filtrarVentas` |
| Aspecto | Piezas únicas (`TarjetaCifra`, `Tabla`, `BarraApilada`, `SelectorMes`, `Pestanas`, `Chip`, `DesplegablePildora`); la pestaña lleva `.pantalla-en-vidrio` (ADR-0596). | — |

**DESCARTÉ** B (Historial con filtro): Historial lo abre todo el mostrador, y la cuenta de cada cobro quedaría a la vista de más gente; no tiene vista lado
a lado ni mes a mes, y filtrar su lista paginada por empresa pedía igual una lectura nueva. Y C (Finanzas): ahí lo de CAYLA no sale y solo lo ve quien
tiene Cuentas y dinero.
**DESCARTÉ** armar las cifras en la web con PostgREST (ventas, líneas, pagos, comprobantes): habría repetido en TypeScript la regla de reparto de la base,
dos lugares para lo mismo (Brooks), y dejaría de cuadrar el día que la regla cambie.

**SE ROMPE SI** pasan más de seis meses desde que llegó CLAURE: «desde que llegó» supera el tope y la base lo rechaza con su motivo; entonces se mira por
mes o fechas, o se sube el tope midiendo cuánto tarda. Y si una venta paga un mismo medio en dos cuentas (dos tarjetas en dos máquinas), la fila sale como
«Varias cuentas»: no se adivina.

## Cómo se verificó

- En **producción, solo lectura**, con las mismas expresiones de la función (Tienda LIM, 23-oct al 14-nov): CLAURE oct S/ 558.00 (efectivo 70, Yape 236,
  tarjeta 252) y nov S/ 1,395.86 (309, 754, 332.86); CAYLA oct S/ 1,194.00 (464, 429, 128, QR 173) y nov S/ 1,812.14 (327, 723, 607.14, 155); 71 ventas,
  5 mixtas; Yape → BCP Empresa, tarjeta y QR → Por depositar Izipay → Interbank Empresas, efectivo → Caja Operativa LIM. La comisión estimada de la tarjeta
  de CLAURE da 7.08 (oct) y 9.36 (nov), igual que `fn_claure_filas`. CLAURE 28 ventas (15 con nota de venta), 33 prendas.
- En **local**, la función con la sesión de la líder, con una tienda de una sola empresa (rechaza, 22023), con más de seis meses (rechaza) y sin fechas
  (usa el día de llegada); la pantalla en el navegador a 1440 px.
- `lib/reportes-por-empresa-reglas.test.ts`: lectura, céntimos, período, plata, lado a lado y filtros.
