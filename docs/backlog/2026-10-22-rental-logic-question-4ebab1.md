## 🏠 Ficha del gasto fijo por categoría: el alquiler ya no habla de «recibo» (2026-10-22, ADR-0452 actualización) — solo web, sin migración; rama `claude/rental-logic-question-4ebab1`

- [x] Títulos, ayudas y qué campos pide la ficha según la categoría (`lib/sugerencias-gasto-fijo.ts`, una tabla; neutra = lo de antes). Alquiler: «Propietario», «N.º de contrato», «Vence el contrato» primero, «Cómo te avisa que toca pagar»; sin la forma «Se paga el recibo».
- [x] «Vence …» solo donde existe (alquiler, servicios, mantenimiento, publicidad, asesoría, póliza, licencia); no en transporte, suministros ni comisiones del banco. Nunca se esconde una fecha o una forma ya cargada.
- [x] Las comisiones del banco ya no piden «N.º de cuenta» en el código (lo ve cualquiera; la cuenta es solo de líder y admin).
- [x] Pruebas: `lib/sugerencias-gasto-fijo.test.ts`; suite de la web completa, `tsc`, `eslint`, `knip`. Probado en el navegador con la base local (Alquileres, Transporte y vuelta); sin guardar.
- [ ] **Sin probar:** capturas a 375 px y modo oscuro de la hoja (solo cambian textos y qué caja aparece); `/chaos` y `/formidable` sobre la hoja «Nuevo gasto fijo».
- [ ] Decisión de Felipe: ¿un campo «cada cuánto se reajusta el alquiler y de cuánto»? Pediría una columna en `gastos_fijos_ficha` y una migración; hoy se puede anotar en «Notas para quien herede esto».
- [ ] Decisión de Felipe: ¿«Vence el contrato» debe contar como «falta» en la lista de fijos cuando es un alquiler? Hoy «falta» es solo propietario, forma de pago y cuenta.
