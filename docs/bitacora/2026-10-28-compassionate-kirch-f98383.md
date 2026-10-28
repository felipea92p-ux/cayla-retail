## 2026-10-28 (Reintentar un movimiento de dinero deshecho avisa en vez de decir «registrado»)
Qué hice: `registrar_movimiento_dinero` ya no devuelve un movimiento anulado cuando se reintenta con el mismo token; falla con «Ese depósito ya se deshizo…» y no escribe (ADR-0548, hermana de ADR-0544). Dos reemplazos anclados, sin tocar los parches vivos. La prueba `cuentas_dinero` suma el caso y acepta `--con-migracion`.
Por qué así: antes la pantalla decía «Registrado» y no había movimiento vigente; la plata no se movía en el sistema y nadie lo veía. Un `create or replace` entero habría pisado tres parches posteriores.
Felipe se lleva: una migración de una sola parte (solo funciones) por pegar en producción; la prueba falla sin ella (2 casos) y pasa con ella (94).
