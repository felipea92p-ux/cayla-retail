# Finanzas ▸ Resumen, camino «A · Bolsillos» (2026-11-09)

Construido en la rama `claude/architecture-design-criteria-adf12e` (ADR-0493, actualización 2026-11-09). Sin migraciones: no toca la base.

- [ ] **Abrir el PR con `/abrir-pr`** cuando Felipe lo pida (los commits son locales).
- [ ] **Ver el estimado con rango con ventas reales**: la base local compartida no tiene ventas de noviembre; solo lo cubren las pruebas
      (`lib/te-deja-mes-reglas.test.ts`). Mirarlo en producción o en la base aislada `cayla-retail-prod` el primer día que se publique.
- [ ] **Prueba con colaboradoras reales** (3 a 5) de «Libre para usar» y los bolsillos: ¿entienden «ya tiene dueño»?
- [ ] **La fecha de SUNAT** sigue siendo el día 15: cargar el RUC (último dígito) para que el bolsillo y su hoja digan el día real.
- [ ] **CTS y gratificación** no entran a «Para el equipo» hasta que Felipe confirme el régimen laboral (la proyección no las anuncia).
- [ ] **Escenarios viejos de `tema:auditar`** que ya no abren en el Resumen: `finanzas.que-mirar` (el combo «Qué mirar» ya no existe) y
      `finanzas.resumen-confianza` (el botón cambió de nombre). Son de antes de este cambio; arreglarlos o borrarlos.
- [ ] **`/formidable` completo** del Resumen nuevo (no se corrió la prueba ciega sobre la pantalla construida, solo sobre la maqueta).
