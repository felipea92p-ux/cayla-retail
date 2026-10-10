## 2026-10-10 (Rescate del PR #831, Plan del piso: fusión con main, piezas únicas y puerta del módulo)
Qué hice: traje la rama del Plan del piso (`claude/category-mix-development-141175`, PR #831, abierto desde el 6-oct) sobre el `main` de hoy (523 commits más): 3 conflictos
mecánicos (`ci.yml`, `rutas-cron.ts`, `vercel.json`, los tres «quedarse con ambos lados») y dos roturas que git no marcó: la pantalla importaba `TabsSubrayado` (retirada) y dibujaba a mano
dos vacíos y dos barras apiladas, que `lib/unificar.test.ts` ya no deja (ADR-0358); pasó a `<Pestanas>`, `<Vacio>` y `ui/BarraApilada`. Y el fallo del CI de verdad: la prueba de roles
(`roles_cobertura_modulos`) decía que `plan_piso` es delegable y ninguna función de la base lo exigía. Felipe eligió que la base lo exija: migración
`20261010170000_plan_del_piso_quien_ve_el_modulo.sql` (las tres lecturas piden `fn_ve_modulo('plan_piso')`) y sus pruebas.
Por qué así: «solo anotarlo en SOLO_PANTALLA» habría cumplido la prueba sin cumplir la regla (apagar el módulo a un rol debe apagarlo también por la API), y esa lista solo puede
encogerse. Hoy ningún rol tiene el módulo, así que para nadie cambia nada: es dejar la base igual de cerrada que la pantalla antes de que el líder lo reparta.
Felipe se lleva: el PR #831 queda listo para subirse con una migración más que pegar (en este orden: `20261006110000`, luego `20261010170000`; la `20261006100000` ya está en
producción). Falta verlo en el navegador y correr las suites SQL de la migración nueva: Docker Desktop se cayó a media sesión y no está verificado todavía (ver el backlog de hoy).
