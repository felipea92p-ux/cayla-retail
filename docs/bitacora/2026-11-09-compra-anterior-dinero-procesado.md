## 2026-11-09 («Me dieron plata» dice el día que llegó)
Qué hice: la fila «BCP Operativa → Fondo · Lizzelott Ramírez −S/ 1,580» era una compra anterior cuya plata ya había salido, pero «Me dieron plata» solo
anotaba con la fecha de hoy y la transferencia con banco entra sola al fondo (ADR-0574), así que el banco la restó dos veces. `20261110025000` suma
`p_fecha` a `anotar_plata_compras` (hoy hacia atrás, hasta 120 días) y la hoja dice «Llegó hoy · Cambiar el día».
Por qué así: primero lo puse en «Confirmar la plata» y estaba mal: leyendo producción vi que esa plata entra sola al anotarla, sin paso de
confirmación. La fecha tiene que decirse donde nace. ADR-0639.
Cómo verificas tú: `node scripts/pruebas/compras_simple_plata.mjs` (35 casos; los 6 últimos son los del día) y, en una base con todo, las suites
`compras_simple_dia`, `_reabrir`, `_cuenta_devolucion` y `fuera_de_cayla`, que ahora rebobinan la firma vieja. En pantalla: Compras ▸ Mi plata ▸ «Me
dieron plata» ▸ elige un medio ▸ «Cambiar el día» (no verificado en el navegador: este checkout no tiene `.env.local`).
