## 2026-10-28 · «Empresa» distinta de «Todas» en Cuentas y dinero ▸ Dónde está · rama `claude/sedes-cuentas-empresa-8ee04a`
- [x] La página `finanzas/dinero` deja de leer «empresa» como «todas»: `getContextoDinero` conserva `ver.soloEmpresa` y la página filtra grupos, «tienes» y movimientos con `lib/dinero-telar-reglas.ts` (`gruposDelAlcance`, `cuentasDelAlcance`, `movimientosDeLaEmpresa`).
- [x] El grupo «CAYLA entera» se renombra «Empresa»; el círculo cambia de bajada y rótulo según lo que se mira (`textosDelReparto`). Guía de Dónde está al día (pasos «Cómo se reparte» y «Cada lugar, con su saldo»).
- [ ] Ver el círculo con la empresa con datos reales (≥ 2 cuentas de la empresa con plata): en la base local solo hay una.
- [ ] Decidir si «A qué cuenta entra cada cobro» debe verse también con «Empresa» (hoy solo con «Todas»: es una tabla por sede).
- [ ] «Te toca» (`api/finanzas/te-toca`) sigue leyendo «empresa» como «todas» para las cajas sin depositar; son pendientes de las tiendas, así que se dejó como estaba. Decidir si «Empresa» debe ocultarlos.
- [ ] «Qué debes» y «Cuadrar con el banco» ya trataban la empresa por su lado (Por pagar con `soloEmpresa`; Conciliación es siempre de la empresa): sin cambios.
