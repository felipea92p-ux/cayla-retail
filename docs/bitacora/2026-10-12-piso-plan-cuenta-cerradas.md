## 2026-10-12 (El contrato del motor del piso con las cerradas sin prenda, al día con main — PR #806)
Qué hice: traje `main` dos veces al PR #806. La migración pasó a `20261005160100` (otra sesión ya usaba `20261005160000`) y se reescribió como
reemplazos anclados: cambia solo los dos filtros `p.estado` y sus comentarios. Así funciona en el orden del CI nuevo, que aplica las migraciones
del PR después de las de main y encima del filtro de familias de `20261010232000`. En los dos órdenes, la función queda con la huella de
producción (`3b9b7a08…`); piso-plan 62/62, motores-familias-apagadas 11/11 y cola-arranque 53/53.
Por qué así: la versión que recreaba la función entera habría borrado el filtro de las bolsas de despacho (y su guarda la frenaba, con lo que
el CI no corría). Anclada, cambia lo suyo y respeta lo que otra migración le agregó en otro lugar: el orden deja de importar.
Felipe se lleva: nada que pegar (producción ya está así desde el 2026-10-05 y re-pegarla no cambia nada); el PR queda listo para fusionar.
