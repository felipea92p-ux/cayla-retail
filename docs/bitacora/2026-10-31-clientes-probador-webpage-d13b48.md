# 2026-10-31 — Vitrina: Probador oculto y «Esperan una talla» con quién espera
- **Qué:** la pestaña Probador sale de la Vitrina (la pantalla sigue por URL); «Esperan una talla» muestra nombre, celular y correo de quienes tocaron «Avísame» (ADR-0593).
- **Estado:** migración `20261031181000` aplicada solo en la base local y probada con datos inventados (deshechos); producción espera el OK de Felipe. Guía y huella al día; `tsc` y 396 pruebas verdes. No visto en el navegador (el worktree no tiene `.env.local`); `clientas_por_modulo_y_anonimizar.mjs` actualizado pero no corrido.
- **Sigue:** pegar la migración en producción y refrescar el diccionario; decidir si el Probador también se redirige.
