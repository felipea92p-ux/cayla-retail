# ADR-0309 — Las pestañas siguen la cuenta del navegador (2026-10-02)

> Renumerado de 0307 a 0309 el 2026-10-02: el 0307 ya era «El cobro sale del ticket» (entraron los dos a main el mismo día)
> y el 0308 lo usa otra rama.

**Problema.** La sesión vive en cookies compartidas. Si alguien sale y entra con otra cuenta en una pestaña, las demás
quedaban dibujadas con el menú y los datos de la cuenta anterior, aunque cada petición ya viajara como la nueva (la base
nunca dio más de lo permitido: RLS y `fn_*` miran la cuenta de la cookie). El riesgo era de confusión: registrar algo
creyendo ser otra persona.

**Decisión.** `components/ui/SesionEntrePestanas.tsx`, montado una vez en `app/layout.tsx`. Cada pestaña recuerda con qué
cuenta se dibujó; si cambia, va sola a `/login` (se cerró) o a `/` (entró otra; no se recarga la ruta porque la cuenta
nueva puede no tener ese módulo). Regla pura y probada: `lib/sesion-entre-pestanas-reglas.ts`.

**Cómo se entera.** `onAuthStateChange` (Supabase ya lo reenvía entre pestañas) y una lectura de la cuenta al volver a
mirar la pestaña (`visibilitychange`/`focus`). Una pestaña sin cuenta (login, páginas públicas) no hace nada.

**Aviso.** Antes de irse la pestaña anota el motivo en `sessionStorage` y la pantalla de destino lo muestra con
`avisar.aviso` («La cuenta cambió», «La sesión se cerró en otra pestaña»); el aviso espera al loader general (ADR-0149).

**Costo asumido.** Una pantalla a medio llenar se pierde al irse; con otra cuenta ya no era de esa persona. Lo guardado
sin conexión vive en el equipo y no se toca.
