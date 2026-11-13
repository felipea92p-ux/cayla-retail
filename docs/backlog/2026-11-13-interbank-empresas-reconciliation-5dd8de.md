## 🏦 Interbank Empresas: el cuadre del 13-nov (2026-11-13) — rama `claude/interbank-empresas-reconciliation-5dd8de`

- [x] «El banco dice» avisa cuando el último día seguía abierto al subir el extracto (`diaSinCerrar`).
- [x] El lector no acusa huecos falsos en el lote del lunes que trae el sábado de antes del archivo.
- [ ] **Felipe, en pantalla:** subir el .txt del 1 al 13 nov; corregir con lo que llegó los depósitos de máquina del 11 y 13 nov que no calzan con el banco; anotar el ITF del 9 y 11 nov.
- [ ] Nombrar la diferencia de QR del 28-29 oct y la de Izipay del 7-9 nov: hace falta leer qué pagos cubre cada depósito (`pos_abonos_pagos`), con otra consulta de solo lectura.
- [ ] Decidir con Felipe una sola forma de registrar los depósitos de máquina de Interbank: hoy conviven el estimado de «Cuadrar depósitos» y el exacto desde el extracto, y la diferencia del 10 al 13 nov nació de mezclarlas.
- [ ] Si el aviso del día a medias no alcanza (archivo bajado un día y subido al siguiente), que `fn_banco_cuadre` devuelva si el último día tiene líneas provisionales.
- [x] **Gratuidad del QR de Izipay corregida en producción (13-nov, con el OK de Felipe):** el banco mostró que los QR de ventas del 11-nov llegaron sin comisión y la tarifa decía gratis hasta el día 10. Como `pos_tarifas` no se edita, se agregó una fila igual (2,38 % + IGV, vigente desde el 1-nov) con `gratis_hasta_dia = 11`; `fn_pos_tarifa` ya la toma (verificado: QR del 11 sin comisión, del 12 con su 2,38 % + IGV). Los depósitos ya registrados no se recalculan: hay que anularlos y volver a registrarlos desde el extracto.
- [ ] La gratuidad vale **todos los meses** (es un número de días, no un período): si Izipay cobra desde el día 1 en diciembre, hace falta una tarifa nueva desde el 1-dic con `gratis_hasta_dia = 0`. Mejor: que la promoción tenga fecha de fin, y que Configuración ▸ Dinero deje cargarla (hoy `guardar_pos_tarifa` no la recibe y solo crea desde hoy).
