# 2026-11-16 · Arma tu outfit: unión de las fotos de IA y señal de carga

Rama `claude/outfit-loading-visual-audit-92e3b8`. Bitácora: `docs/bitacora/2026-11-16-outfit-loading-visual-audit-92e3b8.md`. Decisión: ADR-0449, «Actualización 2026-11-16». Sin migración.

## Hecho

- [x] Los recortes de «Catálogo con IA» (`<id>.png.ia-<sello>.png`) ya se miden: sus prendas se unen con la de abajo.
- [x] Al cambiar de prenda la figura espera la foto y su medida: atenúa la que se va, avisa si tarda y la nueva entra ya unida.
- [x] La que asoma pide su foto al tamaño con que se verá puesta (la flecha no espera), y en la computadora ya no se pide chica.
- [x] El arco es un arco a cualquier ancho; las que asoman se recortan al arco en la computadora y de noche.

## Esperan a Felipe

- [ ] **Mirar en su Mac (Safari) y en un iPhone** al publicarse: no se pudo probar ahí.
- [ ] **Las que asoman en el celular de noche**: quedaron recortadas al arco (casi no se ven; quedan las flechas). Si prefiere verlas enteras hay que
  darles otro tratamiento sobre el fondo oscuro.

## Visto de paso (no se tocó)

- [ ] **La primera carga no avisa**: si las fotos del primer outfit tardan, el arco queda vacío sin decir nada (el esqueleto de la página ya se fue).
- [ ] **«Ajustando…» que dura un parpadeo**: una espera de apenas más de 180 ms muestra la etiqueta un instante y después «✓ Listo» 1,1 s. Ya pasaba
  con la unión; se arregla con un tiempo mínimo a la vista.
- [ ] **El punto «2» de un pantalón ancho** queda flotando al lado de la pierna (va en el borde de la caja, no de la tela).
- [ ] **La medida en la base**: hoy cada recorte nuevo se mide en la primera visita (150 a 750 ms medidos). Guardarla al generar el recorte quita esa
  espera (ADR-0449, descartado (b) del 2026-11-10).
