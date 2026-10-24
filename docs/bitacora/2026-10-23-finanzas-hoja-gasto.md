# 2026-10-23 · El telar: la hoja «Registrar gasto» (PR 2)

- **Qué:** una hoja nueva para registrar un gasto (`components/finanzas/gastos/HojaRegistrarGasto.tsx`).
  - Lo de todos los días son cinco toques.
  - Con comprobante pide el RUC, que se consulta en el padrón, y la serie, que se escribe como sea y se normaliza.
  - A la derecha muestra «Así queda»: el ticket con base, IGV y total, y lo que va a pasar al guardar.
  - Tiene «Guardar y registrar otro» y «Repetir uno anterior».
  - Guarda con `registrar_gasto` como siempre.
- **Por qué:** «si quiero registrar algo con comprobante no puedo» (Felipe). La hoja de antes pedía el RUC en un campo plano y el proveedor
  en un combo.
- **Qué falta:**
  - Pasar a la hoja nueva «Clasificar un egreso», el gasto fijo y el activo, junto con lo de #1271 y #1282 cuando entren.
  - La actividad 9 (ticket, recibo de servicio, retención, detracción y movilidad), que espera al contador.
  - La actividad 10 (repartir un gasto entre sedes), que pide migración.
  - Escanear el comprobante.
  - El `/chaos` completo.
