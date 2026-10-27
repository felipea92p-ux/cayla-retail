# 2026-10-27 — Recibir: el papel cuenta por prenda y se le puede subir la foto (ADR-0538)
- «Lo que anotó X» ya no se llena con el total de la categoría: cada prenda avanza con lo que se identificó de ELLA en «¿Qué … son?» (`avanceDeAnotadas`); Pantalón Mía queda «0 de 4» hasta identificarla.
- Junto a «No subió foto» hay «Subir foto» (cámara o galería); guarda con `agregar_foto_papel` (migración `20261027210000`, solo agrega, no cambia una foto puesta). Ensayada en una base aparte y **pegada en producción el mismo día** (OK de Felipe, verificada).
- Tipos, pruebas de la zona, eslint y Knip en verde. No se probó en el navegador (la base local de retail no estaba levantada).
