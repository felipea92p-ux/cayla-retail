# 2026-10-28 · Recibir: filas de «Terminados» desplegables

- Cada fila de «Lo recibido ▸ Terminados» tiene una flecha que despliega, en la misma tabla, las cantidades por color y talla de cada modelo (con total). El resto de la fila sigue abriendo el modal.
- Lógica pura en `lib/recepcion-matriz-reglas.ts` (con prueba); guía y huella de `recibir` al día.
- Sin cambios de dinero, stock ni permisos.
- «Meter al stock» y «Separar» de Para después (`recepcion-conteo/HacerAhora`) no mandaban el dueño: en Tienda Lima la base rechazaba con «elige si lo que entra es de CAYLA o de CLAURE» (ADR-0542). Ahora piden «¿De quién es la mercadería?» (solo en sedes con dos empresas), bloquean el botón hasta elegir y lo mandan con `conDueno` en `resolverPendiente`. Sin cambios de base.
