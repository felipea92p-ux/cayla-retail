# Recibir: asociar lo contado a una prenda que ya existe (2026-11-06)

Hecho: «¿Esta prenda ya existe?» en «Crear o asociar» (envío cerrado) y en «Crearlo ahora» (envío abierto). `components/recepcion-conteo/YaExisteLaPrenda.tsx`.

Pendiente:
- **Otra marca:** la base no deja ligar a una prenda de otra marca que la línea (`ligar_prenda_a_pendiente`, `recepcion_prenda_ajena`). Hoy se avisa y se pide reabrir y corregir. Si Felipe quiere asociar sin reabrir (2 de los 25 pendientes de producción van sin marca), hay que cambiar esa función y `resolver_pendiente_envio`: migración con su OK.
- **Insignia «Re stock»:** la prenda recién creada al contar también la lleva, aunque no existía antes del envío. Falta distinguirla.
- **Al renombrar «Blusa 1»** (`EditarModelo`) todavía no se pregunta por el catálogo: la pregunta llega al crearla.
- **Duplicados a revisar en producción:** Blusa Boho (sin marca, Lasak), Blusa Encaje (Ivanana, Matic Moda), Blusa Valeria (Anqori, Ruben Tiendas). Pueden ser prendas distintas.
