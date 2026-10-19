# Backlog — Puntos del Club (2026-10-19)

- [ ] **Felipe decide:** el retorno nominal es 5 % (100 puntos = S/ 5 con 1 punto por S/ 1) y el Club tenía un tope de 2 %. Fijar cuánto margen se le dedica en total.
- [x] **Decidido (Felipe, 2026-10-19):** a los 3 años sin compras se eliminan los datos y los puntos; consta en los Términos (5.7) y la Política (2.6).
- [ ] **ABOGADO (pendiente, bloquea publicar):** revisar `docs/club/texto-legal-puntos-v1-borrador.md` (10 preguntas). Sin su OK no entra nada a `retail.club_textos`.
- [ ] **Contador y abogado:** cómo registrar los puntos pendientes como deuda, y los términos del programa.
- [ ] **Módulo nuevo «Beneficios del club» (Clientes), decidido por Felipe:** `insert` en `retail.modulos` sin `rol_modulos` (nace solo para el líder; `delegable` según `fn_es_lider()`); `CLAVES_MODULO` y `MODULOS` en `apps/web/lib/modulos.ts`; hija `clientas.beneficios` en `lib/menu.ts`; `layout.tsx` con `exigirModulo`; funciones que guardan con `fn_actor_persona_id(true)` y el combo «Responsable»; guía de foco y guía interactiva; **quitar la hoja «Beneficios del club» de `AvisosClubPanel`** (y su huella de guía). Los cambios de valor de los puntos rigen a 15 días y quedan en un historial.
- [ ] **Construir (con `/construir`, después del OK):** movimientos de puntos que solo se agregan, saldo derivado, cupón de un solo uso (índice único + clave por toque + bloqueo de fila), reversa en devolución o anulación, regalo de cumpleaños una vez al año, y retirar el vale de aniversario y el 10 % de cumpleaños de `registrar_venta` / `club_canjes`.
- [ ] **Una función de la base ya pesada:** `registrar_venta` es el punto de choque (ADR-0288, `p_canjear_aniversario`); reservar número de migración con `pnpm reservar migracion` al empezar.
- Cómo verificas: abre `docs/maquetas/puntos-2026-10/index.html` y recorre los 6 pasos; el README lista las decisiones y lo abierto.
