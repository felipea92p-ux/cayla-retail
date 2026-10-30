## 🔁 Cambiar el tipo de una orden abierta: muestra ↔ lote (2026-10-30, ADR-0581) — migración y script SIN pegar; rama `claude/ordenes-curso-display-bug-3ffc44`, commiteado en local, sin subir ni PR

- [x] Causa raíz leída en producción (solo lectura): OP-000002, 003 y 004 (16 + 54 + 69 prendas) se abrieron con «Crear un modelo nuevo» y quedaron `es_muestra = true`; el Chaleco (modelo que ya existía) salió lote. Ninguna función cambiaba `es_muestra` después de abrir.
- [x] `cambiar_tipo_orden_produccion` (`20261030151000`) + acción «tipo» en `produccion_cambios` + página de la orden (`CambiarTipoModal`, `lib/orden-tipo-reglas.ts`) + historia + guía interactiva (huella aceptada).
- [x] Pruebas: `pnpm pruebas:produccion-cambiar-tipo` (24, con mutación y con dos sesiones reales), 17 de reglas web, 745 archivos de la web, knip, verificadores de migraciones, roles-cobertura. Navegador: escritorio y 375 px.
- [ ] **PEGAR en producción, primero:** `supabase/migrations/pegar-en-produccion-tipo-de-ordenes-2-3-4-2026-10-30.sql` (ensaya por defecto; con el resultado esperado `false` → `true` en APLICAR). No depende de la migración. Urgente: OP-000002 ya está «Lista para pasar al stock».
- [ ] **PEGAR después**, cuando se publique la web con el botón: `20261030151000_produccion_cambiar_tipo_de_la_orden.sql` (una sola parte, re-ejecutable). No repegar `20261029190000` encima cuando ya existan cambios «tipo».
- [ ] Abrir el PR con `/abrir-pr` (reservas: ADR-0581 y migración `20261030151000`, ya hechas por esta rama). Casilla del PR: pega el SQL de la sección «SQL para producción».
- [ ] Refrescar el diccionario de datos cuando la migración esté en producción (`produccion_cambios`: acción nueva «tipo»; función nueva).
- [ ] Decisión abierta de Felipe: el valor de fábrica «muestra» del modelo nuevo (ADR-0396) causó este error. Con el botón ya hay salida; si el error se repite, la siguiente decisión es pedir el tipo en vez de suponerlo.
- [ ] Al cerrar las tres como lote, la base pedirá confirmar el costo (no declararon tela: saldría en cero) y, si declaran tela, anotarla. Declarar la tela de esas órdenes antes de cerrarlas.
