## 💸 El Yape de Claudia, fuera de los números de CAYLA (2026-11-09, ADR-0638) — actividad 2 de la obra de Lima; rama `claude/lima-yape-fuera-de-cayla`

- [x] `fn_cuenta_es_de_casa`, filtro del libro (también el efectivo que se queda con Claudia), saldos, conciliación, cierre de mes y confianza (`20261110001000`).
- [x] Candados de cuenta ajena: `fn_cuenta_sellada`, `fn_movimientos_dinero_validar`, `fn_medios_de_cobro_validar`, `fn_cuentas_dinero_inmutable`, las 5 listas para elegir y las 5 puertas (`20261110001000`).
- [x] `fn_claure_fuera`, `fn_cuentas_de_otras_empresas` y el asiento `claure_fuera` en `fn_asientos_claure` (`20261110002000`).
- [x] La cuenta «Yape de Claudia · LIM» (`20261110003000`), al final porque es el interruptor.
- [x] Web: nota en Dónde está, bloque «Su Yape» en la pestaña CLAURE y fila de solo lectura en Configuración ▸ Dinero.
- [x] Suite `pnpm pruebas:fuera-de-cayla`, con controles y censo de las columnas con llave a `cuentas_dinero`.
- [ ] **POR PEGAR (2026-11-09):** `20261110001000`, `20261110002000` y `20261110003000`, en ese orden, de noche y sin ventas en curso. Las cinco huellas del encabezado de la primera, antes y después, tienen que salir iguales. Sin pegar, la web no se publica.
- [ ] Al pegar: `pnpm datos:generar:produccion` y `pnpm datos:comparar` con el volcado nuevo, para que el diccionario tenga `fn_cuentas_de_otras_empresas`.
- [ ] Lo que sigue en la obra: el sello por dueño (cada Yape nuevo cae donde debe) y mover a la cuenta los Yapes ya registrados.
