# 2026-10-03 — Reponer y Subir prenda con todos los colores del modelo

- **Qué:** «Reponer prenda» y «Subir prenda» (tarjeta y cajón de Existencias) abren el modelo entero en una tabla color × talla, la misma de Nuevo/Editar producto, con todo en 0 y UNA llamada a `bajar_al_piso` / `retirar_del_piso`. Sin migración. ADR-0320; maqueta en `docs/maquetas/bajar-por-modelo-2026-10/`.
- **Por qué:** bajar un Polo en 3 colores eran 3 búsquedas, 3 ventanas y 3 esperas; la escritura en la base tarda 32 ms, lo lento era repetir el ciclo.
- **Pendiente (no hecho):** probar con una cuenta real en tienda; extraer la pieza común con Editar producto; la recarga de pantalla tras guardar (`fn_resumen_variantes` ~640 ms de media) no se tocó.
