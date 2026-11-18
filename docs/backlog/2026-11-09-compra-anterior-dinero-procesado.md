# «Me dieron plata» dice el día que llegó (2026-11-09)

Rama `claude/compra-anterior-dinero-procesado-445588` (ADR-0639). Cambios sin commit ni PR (Felipe aún no lo pidió).

- [ ] **Pegar `20261110025000` en producción** (Felipe, SQL Editor, de una sola vez: solo funciones). Pégala antes de publicar la web: la web solo manda `p_fecha` si alguien cambia el día, pero en ese caso una base sin la migración no conoce el dato y rechaza el guardado.
- [ ] **Corregir la fila de Lizzelott (S/ 1,580, 9-nov)** con un aporte compensatorio de S/ 1,580 a BCP Operativa, registrado desde Cuentas y dinero por Felipe (el movimiento `70d636aa…` no se anula), si el saldo del banco ya había descontado esa plata antes.
- [ ] **Mirarlo en el navegador** (escritorio y 375 px, claro y oscuro): este checkout no tiene `.env.local` y no se pudo abrir la hoja. `guias:recorrer` del paso «¿Qué día te llegó?».
- [ ] **`/formidable` y `/chaos`** de la hoja «Me dieron plata» con el calendario (guarda plata).
- [ ] `docs/datos/generado/` se refresca cuando la migración esté en producción (`pnpm datos:generar:produccion`).
