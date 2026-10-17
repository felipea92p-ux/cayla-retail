## 2026-10-17 (Registrar movimiento: el piso de fecha en la base y lo de la empresa en la lista de cualquier tienda)
Qué hice: la mitad en la base de los dos hallazgos de /chaos del 2026-10-16 sobre «Registrar movimiento» (Finanzas ▸ Cuentas y dinero) con el
pago de la planilla y el pago a SUNAT (ADR-0417): `20261017143000` hace que `registrar_movimiento_dinero` rechace una fecha anterior al inicio
de Finanzas con el mismo mensaje que un gasto (`movimiento_antes_del_inicio`, el piso de ADR-0412) y que `fn_movimientos_dinero` le muestre al
líder, mirando una tienda, también lo de la empresa (sin tienda: planilla, SUNAT, entre bancos, tarjeta, plata del dueño). Quien no es líder
ve lo de siempre. Con su prueba (`pnpm pruebas:movimientos-dinero-inicio-y-empresa`, en el CI) y la actualización del ADR-0417.
Por qué así: dos reemplazos anclados sobre las funciones vivas, cada uno sumado sin partir el texto que otra migración dejó (la regla de la
183000), porque las suites del fondo por rendir repegan sus parches encima. La lista de una tienda muestra lo de la empresa porque los bancos
ya se ven en toda tienda: un saldo que baja sin el movimiento que lo bajó es la pantalla mintiendo. Un `check` en la tabla se descartó: frenaría
el depósito de un egreso del cajón anterior al inicio, cuya fecha la pone la caja.
Felipe se lleva: **decidir si se pega `20261017143000`** (dinero y RPC son suyos; una sola parte, sin políticas) y si prefiere que lo de la
empresa se vea en toda tienda o solo en «Todas». La web del commit `9b4575544` (rama `claude/finanzas-revisiones-ab242a`) no está en `main`:
hasta que entre, la pantalla deja escribir 1900 y es la base la que lo frena, con el mensaje a la vista. Probado en una pila propia al día con
`main` (`cayla-pila-dinero`): la suite nueva, `pago-planilla-y-sunat`, `cuentas-dinero`, `rendicion_fondo` y `finanzas-montos-y-caja-fuerte`
contra esa base, y vitest.
