# Entrar al módulo al instante (ADR-0628) — pendientes

- [ ] Verlo en producción con una cuenta de tienda: clic en Existencias, Caja y Finanzas. La fila se marca y el esqueleto dice su nombre al momento.
- [ ] Llevar la misma señal a los enlaces de dentro de las pantallas que llevan a otro módulo (tarjetas del Inicio, «Ver» en filas), si Felipe lo
  pide: es llamar a `entrarAlInstante` en su `onClick` (así se llama desde el 2026-11-10).
- [ ] Existencias tarda ~3 s en producción: medir su cargador (`inventario/page.tsx`, cuatro tramos en serie, ver el backlog de ADR-0622).
