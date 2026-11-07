# Estados financieros: lo que falta (ADR-0621)

Las cifras están fuera del repo, en el informe de la auditoría.

## Construir
- [x] **Fondo de compras:** construido en `20261107165000` (ADR-0621, act. 2026-11-07). Pegado en producción el 2026-11-07. **Falta** mirar las pantallas en la vista previa (Flujo, Resumen, Cuentas y dinero).
- [ ] **Proyección:** `puntoMasBajo` incluye hoy y mira cada día; cobros por nivel real y temporada, meta como escenario; reposición % de costo; días de caja restan impuestos fechados; aviso de CTS y gratificación; domingo sin venta da 0.
- [ ] **Ajuste de conciliación:** tipo nuevo, separado de `aporte`, con cuenta de pasivo.
- [ ] **Sueldos:** rangos partidos por mes; Patrimonio con el puente; `hastaDeLaProvision`.
- [ ] **Patrimonio antes del arranque:** octubre deducido y rotulado.
- [ ] **Comprobación:** regla de pagos del Taller; causas con tope; 41, 50, 479 y 591 con segundo camino.
- [ ] **Comprobantes:** `anular_comprobante` exige destino de la venta.
- [ ] **Bancos:** saldo por cuenta y mínimo diario en la 104; freno en `registrar_abono_pos`.
- [ ] **Sobrantes:** línea propia; aviso de faltantes de octubre.
- [ ] **Pantalla:** tono por celda; «Hoy» repetido con y sin Claudia; impuestos del mismo día; descarga del contador por rango; Balance con Empresa.

## Decide Felipe, con su contador
- [ ] Confirmar el saldo a favor contra el PDT y su contrapartida.
- [ ] Régimen laboral: define beneficios del arranque y CTS/gratificación proyectadas.
- [ ] Qué proveedores dieron crédito fiscal: define la corrección de costo de octubre.
- [ ] Nota de venta con IGV o boleta (toca SUNAT).
- [ ] Si los ajustes de banco fueron plata suya, con extracto.

## Registrar (datos, no código)
- [ ] Cotejar con stock y completar los papeles de compras.
- [ ] Pasar los extractos de los cuatro bancos y rehacer los abonos del 31-oct.
