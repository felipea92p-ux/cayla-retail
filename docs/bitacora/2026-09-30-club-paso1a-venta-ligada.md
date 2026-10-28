## 2026-09-30 (Club de clientas, tanda 1a: la venta queda en la ficha de la clienta y el documento tiene tipo)

Qué hice: la migración `20260930160000` (sin pegar) cambia `clientas.dni` por `documento_tipo` (DNI por defecto,
carné de extranjería o pasaporte) y `documento_numero`, con candado de formato y único por tipo y número. Se reescribieron
`registrar_clienta` y `editar_clienta`, que además ligan las compras anteriores con ese documento (CL-27).
`registrar_venta` ahora guarda la clienta del ticket: sigue una ficha unida y rechaza una anonimizada. En la web, Cobrar
registra a la clienta desde el ticket (tipo de documento, padrón para el DNI, nombre a mano si el padrón no responde) y
manda `p_cliente_id`; `/clientas` suma el tipo de documento en alta, edición, lista y exportación. Tres agentes en
paralelo (Clientas, Cobrar y pruebas SQL) sobre un contrato de tipos fijado antes.

Por qué así: hasta hoy ninguna venta llegaba a la ficha de nadie (`p_cliente_id` existía y la web no lo mandaba), y un
carné guardado como «dni» habría salido en la boleta con el código de DNI. El agente de pruebas encontró tres defectos
antes de producción:
- toda venta SIN clienta fallaba (un `record` sin asignar);
- pegar dos veces duplicaba el bloque;
- una venta y una unión de fichas a la vez dejaban la venta en la ficha unida.
Los tres quedaron corregidos y probados.

Felipe se lleva: verificado en navegador a 375 px contra un stack aislado. Registrar desde el ticket, cobrar, ver la
compra en su ficha (con talla y «Falta 2»), alta con carné y una venta sin clienta. Pruebas SQL: `club_venta_ligada`
31/31, `clientas` 30/30, `clientas_por_modulo_y_anonimizar` 37/37, `registrar_venta` 28/28. Pegar la migración y
fusionar el PR seguidos: entre medio, la pantalla vieja no puede registrar ni editar fichas.
