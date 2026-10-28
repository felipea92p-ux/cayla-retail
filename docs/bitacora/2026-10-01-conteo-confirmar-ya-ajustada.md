## 2026-10-01 (Confirmar no anuncia ajustes que ya se hicieron; un solo «Había»)
Qué hice: al reabrir un conteo con «Corregir conteo» y cerrarlo sin tocar una línea ya ajustada, Confirmar dejó de decir «Se actualizará 1 variante · quedará en 4»: esa línea pasa a «no cambia», con su nota. Y la marca «Había N» y la nota de la fila usan el mismo número.
Por qué así: `cerrar_conteo` no vuelve a ajustar una línea ya ajustada; la pantalla prometía lo contrario (visto con el Conteo 25: el stock se quedó en 3, como debía). Con dos correcciones (3 → 2 → 3) la fila mostraba dos «Había» distintos.
Felipe se lleva: solo web, sin migración; suite (262 archivos), `tsc` y eslint en verde; no visto en producción hasta fusionar.
