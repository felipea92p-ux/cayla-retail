# Maqueta — Conteo físico (`/inventario/conteo`), 2026-09-22

Demo interactiva del rediseño de Conteo sobre la guía oficial de la Sala de Diseño (paleta «CAYLA Dynamic»: crema,
papel, tinta, sand, hueso; EB Garamond + DM Sans; radios 8/16/20; un solo ease). **Es una maqueta, no código de la
app**: no se importa desde `apps/web`. Se abre `conteo.html` en el navegador (fuentes por CDN). Publicada también como
artifact: https://claude.ai/artifact/U6e6UwKXX3rByebdBPDLrD

La barra negra de arriba no es parte de la pantalla: cambia de momento (sin conteo abierto → contando → revisar y
cerrar → conteo cerrado) y compara las dos variantes de «pendientes». Todo es clicable: la «pistola de prueba» simula
lecturas, un código que no existe abre «dar de alta», y cerrar pasa por la espera global y el aviso.

## Decisiones de Felipe (2026-09-22)
1. **Cantidad: los dos modos, con interruptor** — «Suma por escaneo» (cada lectura +1, guarda al instante; − / + y la
   cifra corrigen) y «Escribir cantidad» (como hoy). `conteo_contar` recibe cantidad absoluta: la suma se resuelve en
   la pantalla con lo ya anotado (`conteo.items`), sin cambio de base.
2. **Conteos vacíos:** insignia taupe «Vacío», fuera de la exactitud, y **un conteo sin prendas no se cierra**: se
   cancela. Para que sea regla y no solo botón, `cerrar_conteo` tiene que rechazar un conteo sin `conteo_items`
   (migración propia, con OK antes de producción).
3. **Pendientes mientras se cuenta: abierta.** Felipe pidió verlo en demo — variante A (lista sin cifras del sistema)
   vs. variante B (solo el número). Falta que elija.

## Otros cambios que trae la maqueta (recomendación, sin decisión de negocio)
- La tarjeta «Diferencia hasta ahora» **ya no se muestra con un conteo abierto**: revelaba lo que dice el sistema y
  rompía el conteo a ciegas. La diferencia se ve al revisar.
- Sin conteo abierto, «Conteo abierto: Ninguno» pasa a ser «Valor sin contar» (suma de `fn_prioridad_conteo`).
- Abrir en tres pasos visibles (dónde / qué / quién) y el botón dice qué falta; categorías con buscador y las tres
  con más plata en riesgo primero, en vez del desplegable de 25 «Solo …».
- La terminal se nombra «Terminal · Almacén Trujillo», no «ESTACIÓN — … (no es persona)».
- El detalle abre filtrado en «Con diferencia» y agrega la columna en soles.
- «Revisar antes de cerrar» pasa a `<Modal>` (ADR-0136) — hoy dibuja su propio `fixed inset-0`.

## Ojo al llevarla al código
- Los datos son de ejemplo (prendas, SKUs, montos). Los 4 conteos del historial son los reales de TRU (todos vacíos).
- El lateral es solo contexto; no se propone cambiarlo aquí.
- Las piezas ya existen: `Tabla`, `Chip`, `ComboResponsable`, `ProductoVarianteCelda`, `Modal`, `avisar`, `EsperaGlobal`.
