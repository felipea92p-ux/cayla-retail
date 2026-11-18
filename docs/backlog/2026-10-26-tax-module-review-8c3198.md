## 🧾 Impuestos: maqueta «pocas palabras» y lo que falta para concluir el módulo (2026-10-26) — rama `claude/tax-module-review-8c3198`, solo documentos y maqueta

- [x] Maqueta tocable en `docs/maquetas/impuestos-simple-2026-10/` (tres direcciones, tres estados, sede, desglose de «IGV de tus compras»; probada en escritorio, a 375 px y en oscuro).
- [x] Investigación: `docs/investigacion/2026-10-26-impuestos-obligaciones-y-cobertura.md` (qué exige SUNAT, qué cubre hoy el módulo).
- [ ] **Felipe elige dirección** (recomendado: C como base + ecuación de B en «¿Por qué?» + paso «Al contador» de A) y dice si Impuestos solo prepara y avisa (D-36) o también declara.
- [ ] Construir la elegida con `/construir`, sin tocar los cálculos del IGV (los lee tal cual de `fn_impuestos_panel`). Una pantalla rediseñada nace con su guía de foco y su guía interactiva.
- [ ] Decisiones de Felipe que siguen abiertas: IGV por sede (`IGV del mes por lugar`), unir cada pago a SUNAT con el mes que paga, fecha de vencimiento por último dígito del RUC, excepción de movimiento de ADR-0136 para Finanzas.
- [ ] **Contador:** confirmar si CAYLA está obligada al SIRE (desde agosto 2024 para el RMT, según fuentes secundarias) y el formato del archivo; confirmar si el Libro Diario y el Mayor deben ser electrónicos al pasar las 300 UIT (la pantalla hoy lo afirma en `ImpuestosPanel.tsx`, `Limite`); ITAN (activos netos sobre S/ 1 000 000); renta anual (fechas y tasas); detracciones y retenciones.
- [ ] Si el contador confirma que no son «electrónicos», quitar esa palabra de la bajada de la tarjeta del límite.
- [ ] Un aviso de ITAN y una estimación del impuesto a la renta anual (a partir del Balance General) son piezas nuevas: cada una con su ADR.
