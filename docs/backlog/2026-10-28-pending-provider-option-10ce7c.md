# Backlog · 2026-10-28 · Fase afuera «por definir» — rama `claude/pending-provider-option-10ce7c`

ADR-0550. Migración `20261028034000_produccion_fase_afuera_por_definir.sql`, una sola parte, **por pegar en producción**.

- [ ] **Pegar la migración en producción** y volver a correr `pnpm datos:generar:produccion` cuando se refresque el volcado (el CHECK `produccion_fases_quien` cambió).
- [ ] **Aviso de «órdenes con fases por definir» en Inicio.** No se construyó: si en la práctica las órdenes se quedan quietas con fases sin definir, es el siguiente paso (el riesgo que nombra el ADR).
- [ ] **Orden «de antes» y cierre «ya estaba en stock»** (plan del 27-oct, actividades 2 y 3): siguen pendientes. Hasta entonces, no marcar fases como hechas ni «Pasar al stock» en la OP-1 del Chaleco Cayla (duplicaría stock).
- [ ] **Guía de foco de «Cambiar quién»:** `camposDeCambiarQuien` no cambió (por definir no tiene faltas). Revisar con `/focus` si Felipe quiere que la guía destaque el tercer segmento.
