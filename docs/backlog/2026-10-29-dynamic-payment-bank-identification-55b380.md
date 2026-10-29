## Finanzas ▸ la salida del banco de la planilla que Dynamic paga (ADR-0567, 2026-10-29)

- [x] Ver lo que falta registrar: el grupo pagado partido por el banco del colaborador (`20261029052000`).
- [x] De qué cuenta sale cada banco, en Configuración ▸ Cuentas y cobros (`20261029053000`).
- [x] Registrar de un toque, todo o nada, o enlazar una registrada a mano (`20261029054000`, `SalidasPlanillaModal`).
- [x] El aviso en «Te toca» del líder y en «Por revisar» del Observatorio.
- [ ] **POR PEGAR en producción, en este orden:** `20261029052000` → `20261029053000` → `20261029054000` (cada una en un solo pegado; crean tablas nuevas, funciones y un disparador, sin políticas). Verificado el 2026-10-29 que todo lo que asumen existe en producción y que nada de lo nuevo choca. Después: elegir las cuentas en Configuración ▸ Cuentas y cobros, y refrescar `docs/datos/generado/` (`pnpm datos:generar:produccion`).
- [ ] **/chaos, dos hallazgos g2 (esperan el OK de Felipe):** (1) con una salida suelta registrada a mano, la hoja arranca en «Registrarla ahora» y confirmar sin mirar duplica la salida; (2) un monto con un cero de más (127400 por 12740) se registra sin aviso y el aviso desaparece.
- [ ] /formidable completo (prueba ciega con agente), ofrecido a Felipe; hoy solo la medición.
- [ ] **Para el contador:** el 62 | 41 de la planilla se asienta por el costo real (neto + AFP + renta de 4ª + EsSalud + provisiones, ADR-0474), pero el «Pago de la planilla» solo baja el neto: la 41 seguirá con lo retenido y lo provisionado hasta que esos pagos (AFP, SUNAT, CTS, gratificación) se registren por su lado.
- [ ] Fuera de este repo: que Dynamic guarde el banco de cada persona como una lista cerrada (hoy texto libre: BCP escrito de 3 formas, 6 sin banco, 1 con un número de cuenta en ese campo).
