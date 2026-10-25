# 2026-10-24 · Finanzas ▸ Resumen: qué agregar, qué quitar y cinco piezas nuevas

- **Qué:** análisis `/pantalla` (modo rápido) del Resumen sobre el diseño de #1311 (`docs/pantallas/finanzas-resumen.md`), cinco spikes tocables
  (`docs/maquetas/finanzas-v3-2026-10/resumen-siguiente/`) y, aprobada la lista por Felipe, las cinco piezas construidas encima de #1311 ya fusionado, solo web:
  «Tu caja en las próximas dos semanas», «¿Puedo fiarme de este número?» (el medidor sube bajo la respuesta), «¿Ya pagaste el mes?» (reemplaza a «ventas contra la meta»),
  «Lo que más se movió desde el mes pasado» y «De cada S/ 100 que vendes». Un commit por pieza.
- **Por qué:** #1311 dejó al Resumen contestando «¿cuánto me deja?» y ya no «¿me alcanza?»; la meta es de Rendimiento y el equilibrio es de Finanzas; y el medidor de confianza
  estaba lejos de la cifra que califica. Dos hallazgos al construir corrigieron el análisis: `fn_resumen_finanzas` recorta los cobros (la caja necesita su propia lectura) y
  la lista «no revisado» NO es lo mismo que la confianza (se queda).
- **Qué falta:** `/formidable` del Resumen (con OK de Felipe y datos reales: la base local no tiene ventas, así que «cada S/ 100» y el estado completo del equilibrio solo se vieron con
  cifras de ejemplo); escenario de `tema:auditar` para los cien cuadros (necesita ventas); el escenario viejo `finanzas.que-mirar` de `tema/escenarios/registro.mjs` apunta a un combo que ya no
  existe en el Resumen. PR sin abrir.
