## 2026-10-10 (Rescate del PR #831, Plan del piso: fusión con main, piezas únicas y puerta del módulo)
Qué hice: traje la rama del Plan del piso (`claude/category-mix-development-141175`, PR #831, abierto desde el 6-oct) sobre el `main` de hoy (523 commits más): 3 conflictos
mecánicos (`ci.yml`, `rutas-cron.ts`, `vercel.json`, los tres «quedarse con ambos lados») y dos roturas que git no marcó: la pantalla importaba `TabsSubrayado` (retirada) y dibujaba a mano
dos vacíos y dos barras apiladas, que `lib/unificar.test.ts` ya no deja (ADR-0358); pasó a `<Pestanas>`, `<Vacio>` y `ui/BarraApilada`. Y el fallo del CI de verdad: la prueba de roles
(`roles_cobertura_modulos`) decía que `plan_piso` es delegable y ninguna función de la base lo exigía. Felipe eligió que la base lo exija: migración
`20261010171845_plan_del_piso_quien_ve_el_modulo.sql` (las tres lecturas piden `fn_ve_modulo('plan_piso')`) y sus pruebas.
Por qué así: «solo anotarlo en SOLO_PANTALLA» habría cumplido la prueba sin cumplir la regla (apagar el módulo a un rol debe apagarlo también por la API), y esa lista solo puede
encogerse. Hoy ningún rol tiene el módulo, así que para nadie cambia nada: es dejar la base igual de cerrada que la pantalla antes de que el líder lo reparta.
Felipe se lleva: el PR #831 queda listo para subirse con una migración más que pegar (en este orden: `20261006110000`, luego `20261010171845`; la `20261006100000` ya está en
producción). Falta verlo en el navegador y correr las suites SQL de la migración nueva: Docker Desktop se cayó a media sesión y no está verificado todavía (ver el backlog de hoy).

## 2026-10-10 (misma sesión: la revisión adversarial de la migración nueva, antes de pegarla en producción)
Qué hice: tres revisores de solo lectura (permisos y seguridad; seguridad de pegarla en producción; pruebas y documentación) y un escéptico por hallazgo, 13 agentes: 10 hallazgos, 9 confirmados,
1 refutado, y se corrigieron los 9. El de peso: la versión `20261010170000` de mi migración la había tomado, minutos antes, `20261010170000_revisar_productos_pendientes.sql` (PR #924) en `main`; al fusionar,
`migraciones:versiones` del CI se ponía rojo y `supabase start` fallaba por llave duplicada. Se renombró la MÍA (la que no estaba en producción) a `20261010171845`. Además: el caso de la cuenta de afuera
había pasado a probar la puerta del módulo y no la de retail (pasaba en falso; ahora exige la pista vacía), los comentarios del CI y el `--en-seco` describían lo viejo, y una fecha de producción estaba mal (2026-10-05).
Por qué así: lo que esta migración toca son permisos y se pega a mano en producción, donde un error no se deshace con un revert; una revisión que intenta REFUTAR cuesta minutos y encontró algo que ninguna prueba mía habría visto,
porque la colisión no existía cuando empecé: `main` se movió mientras trabajaba.
Felipe se lleva: (1) dos avisos que quedaron escritos en la migración, el ADR y el backlog: **no re-pegar `20261006100000` ni `20261006110000` después de la tercera** (traen las mismas funciones sin la puerta y se la quitan en silencio),
y (2) un límite: ocultar `plan_piso` a un líder le apaga las lecturas pero no `fijar_grupos_de_categorias`, que solo pide ser líder; pedirle también el módulo es otra decisión tuya, y hoy nada se lo oculta a nadie.
