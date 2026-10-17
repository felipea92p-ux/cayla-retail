## 2026-10-17 · Finanzas ▸ Resumen: el titular no afirma más de lo que se sabe

- **Qué:** el «Sí, te quedan S/ …» de Resumen salía firme aunque el medidor de confianza dijera 33 %. Ahora `matizarRespuesta`
  (`apps/web/lib/pulso-reglas.ts`) decide cuánto se afirma: confianza **alta** → «Sí»/«No» como antes; **media** → «Sí, por ahora»
  con un aviso; **baja o sin medir** → chip «Provisional», «Con lo que hay registrado, te quedan ≈ S/ …» y la nota «Es provisional».
- **Por qué:** AQP no tiene gastos fijos cargados y los sueldos de una sede solo entran cuando Dynamic marca el período pagado
  (`planilla_por_sede`, `ubicaciones.sede_dynamic_id`); los gastos de empresa (sin sede) no se reparten. Con eso faltando, el número
  sale más alto que lo real y el titular no debía sonar seguro (ADR-0417, principio 9: lo que no se midió no es «alta»).
- **Solo pantalla:** ninguna cifra, RPC ni migración cambia. Reportes (`ResultadoPulso`) sigue con `respuestaDeFila` tal cual: no carga el medidor.
- **Pruebas:** `lib/pulso-reglas.test.ts` («matizarRespuesta»). Verificado en el navegador local (el medidor falló allí porque la base local no
  tiene `fn_finanzas_confianza`, y salió «Provisional»); el caso de confianza baja medida usa la misma rama.
