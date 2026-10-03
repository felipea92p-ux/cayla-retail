# 2026-10-03 — Caja: el botón «Cerrar caja» se nota (ADR-0318)

- **Qué:** botón rojo con candado en la cabecera, barra fija de escritorio que sube de nivel con la hora de cierre y cuadrado rojo en el celular; `lib/caja-cierre-boton-reglas.ts` con 7 pruebas. Maqueta del rediseño con comparativa vs ayer en `docs/maquetas/caja-comparativa-2026-10/`.
- **Por qué:** las vendedoras olvidan cerrar; la Isla no aparece porque `hora_cierre` está vacía en producción.
- **Pendiente:** cargar `hora_cierre` de las tres tiendas; probar a 375 px y con cuenta real; elegir diseño del comparativo y construir `fn_comparativa_caja`.
