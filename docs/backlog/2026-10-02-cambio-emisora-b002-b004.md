## 🧾 AQP a la serie 04, Lima a la 05 (2026-10-02, ADR-0310) — script PEGADO en producción el 2026-10-02; rama `claude/cambio-emisora-b002-b004-76656e`

- [x] Producción leída en solo lectura: 32 boletas B002 de AQP, todas `enviado` y rechazadas en el panel de Lucode; ninguna con notas ni aceptada.
- [x] Script `pegar-en-produccion-aqp-serie-04-lima-serie-05-2026-10-02.sql` probado en la base local (escenario de 3 boletas, en transacción con rollback): aplica, es idempotente y se frena si una B002 está aceptada.
- [x] `fecha_de_emision` ya no es UTC ni la del reenvío: `fechaDeLima` + `created_at` del comprobante (`lib/lucode.ts`, `lib/transmitir-comprobante.ts`, 4 pruebas nuevas en `lib/lucode.test.ts`).
- [x] **Pegado en producción el 2026-10-02** (Felipe autorizó que lo pegue Claude), después de fusionar el PR 731 y de que Vercel desplegara `main`. Verificado con `select`: AQP con B004 F004 BC04 FC04 NV04 activas (B004 con próximo 36) y Lima con B005 F005 BC05 FC05 NV05 activas desde 1; las 10 viejas archivadas; las 32 boletas B002-1…32 respaldadas y renumeradas a B004-4…35 (`retail.respaldo_b002_renumeradas_20261002`); al verificar, B004-4…6 ya estaban `aceptado` por Lucode (el barrido las tomó solo) y 29 `pendiente`.
- [x] Lucode confirmó (2026-10-02) que las series 4 y 5 están bien para todo.
- [ ] Terminar de transmitir B004-7…35 (pendientes): se envían con el barrido de Comprobantes ▸ Emitidos o con «Transmitir». El barrido solo toma las de menos de 3 días: las del 30-sep, a mano.
- [ ] **Lucode:** que ignore o borre B002-1…32.
- [ ] **Sin resolver:** B001-4 está ACEPTADO en Lucode pero `enviado` en el ERP, y F001-1 sigue PENDIENTE allá. `consultarEstadoLucode` existe y nadie la llama: ningún comprobante `enviado` se vuelve a consultar. Decidir si una pantalla o el barrido lo hace.
- [ ] Tras pegar y refrescar el volcado: `retail.respaldo_b002_renumeradas_20261002` entra al diccionario (`pnpm datos:generar:produccion`).
- [ ] La guarda `cronNoTransmite` (ADR-0278) sigue sin decidirse: con producción activa el cron no transmite nada.
