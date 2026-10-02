# ADR-0307 — Las pestañas siguen la cuenta del navegador (2026-10-02)

**Problema.** La sesión vive en cookies compartidas. Si alguien sale y entra con otra cuenta en una pestaña, las demás
quedaban dibujadas con el menú y los datos de la cuenta anterior, aunque cada petición ya viajara como la nueva (la base
nunca dio más de lo permitido: RLS y `fn_*` miran la cuenta de la cookie). El riesgo era de confusión: registrar algo
creyendo ser otra persona.

**Decisión.** `components/ui/SesionEntrePestanas.tsx`, montado una vez en `app/layout.tsx`. Cada pestaña recuerda con qué
cuenta se dibujó; si cambia, va sola a `/login` (se cerró) o a `/` (entró otra; no se recarga la ruta porque la cuenta
nueva puede no tener ese módulo). Regla pura y probada: `lib/sesion-entre-pestanas-reglas.ts`.

**Cómo se entera.** `onAuthStateChange` (Supabase ya lo reenvía entre pestañas) y una lectura de la cuenta al volver a
mirar la pestaña (`visibilitychange`/`focus`). Una pestaña sin cuenta (login, páginas públicas) no hace nada.

**Costo asumido.** Una pantalla a medio llenar se pierde al irse; con otra cuenta ya no era de esa persona. Lo guardado
sin conexión vive en el equipo y no se toca.
