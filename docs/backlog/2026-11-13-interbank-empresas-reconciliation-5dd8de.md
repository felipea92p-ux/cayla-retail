## 🏦 Interbank Empresas: el cuadre del 13-nov (2026-11-13) — rama `claude/interbank-empresas-reconciliation-5dd8de`

- [x] «El banco dice» avisa cuando el último día seguía abierto al subir el extracto (`diaSinCerrar`).
- [x] El lector no acusa huecos falsos en el lote del lunes que trae el sábado de antes del archivo.
- [ ] **Felipe, en pantalla:** subir el .txt del 1 al 13 nov; corregir con lo que llegó los depósitos de máquina del 11 y 13 nov que no calzan con el banco; anotar el ITF del 9 y 11 nov.
- [ ] Nombrar la diferencia de QR del 28-29 oct y la de Izipay del 7-9 nov: hace falta leer qué pagos cubre cada depósito (`pos_abonos_pagos`), con otra consulta de solo lectura.
- [ ] Decidir con Felipe una sola forma de registrar los depósitos de máquina de Interbank: hoy conviven el estimado de «Cuadrar depósitos» y el exacto desde el extracto, y la diferencia del 10 al 13 nov nació de mezclarlas.
- [ ] Si el aviso del día a medias no alcanza (archivo bajado un día y subido al siguiente), que `fn_banco_cuadre` devuelva si el último día tiene líneas provisionales.
