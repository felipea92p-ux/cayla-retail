## 🔎 Padrón DNI/RUC: SUNAT público primero (2026-09-29, ADR-0008 «Actualización») — solo web, sin migración; rama `claude/sunat-dni-ruc-apis-1f7dc9`

- [x] `lib/padron.ts`: orden caché → SUNAT público (3 s) → proveedor de pago; interruptor de circuito (3 fallos → 5 min); palanca `PADRON_SUNAT_PUBLICO` (`solo_dni` / `no`). `RespuestaPadron.via` dice qué servicio contestó.
- [x] `ConsultaDocumento.tsx`: «Según SUNAT, consultado ahora» y, si no hay estado (RUC), «No informa si el RUC está activo y habido». Visto en el navegador (RUC gratis, RUC de pago con chips, DNI).
- [x] Verificado: `lib/padron.test.ts` 45 casos (mutaciones que rompen las pruebas correctas), suite completa 247 archivos verde, `consultarPadron("ruc", …)` real contra SUNAT sin proveedor configurado.
- [ ] **Decisión de Felipe:** para RUC, SUNAT gratis no trae estado ni condición, así que la advertencia de «baja / NO HABIDO» ya no sale en esos RUC. Si se quiere conservarla en facturas: `PADRON_SUNAT_PUBLICO=solo_dni` en Vercel.
- [ ] **Sin probar:** el éxito del DNI con un número real (solo se vio «no existe»); si el orden del nombre difiere del proveedor de pago hay que normalizarlo. Tampoco se probó desde las IP de Vercel: mirar en producción si SUNAT responde o el interruptor la está saltando.
- [ ] Al pegar las variables en Vercel no hay nada obligatorio nuevo: `PADRON_SUNAT_PUBLICO` es opcional (vacío = DNI y RUC).
