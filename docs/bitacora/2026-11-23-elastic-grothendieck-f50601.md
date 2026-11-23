## 2026-11-23 (Dos detectores de lo que falla sin avisar: el relleno a propósito y el botón que no hace lo que dice)
Qué hice: el escáner de observabilidad marca ahora el «relleno silencioso» (`.catch(() => null)`, `catch { return [] }`) y un candado del CI
(`apps/web/lib/relleno-silencioso.test.ts`) exige que el que es a propósito lo diga con `// relleno-a-proposito: <motivo>`; de 184, marqué a
mano los 55 que ya explicaban su motivo y quedan 129 en 94 archivos como deuda que solo baja. Y `/chaos` suma su novena familia, «El botón
que no hace lo que dice» (8 ataques, 4 de núcleo), con un lector del código (`scripts/chaos/boton.mjs`) que marca el refresco tras guardar,
el efecto que copia una prop y el efecto sin guardia.
Por qué así: son las dos ideas de la revisión del repositorio de skills `affaan-m/ecc` (el agente `silent-failure-hunter` y la skill
`click-path-audit`) que cubrían huecos de nuestros detectores: un relleno no da error y un botón que no logra lo que promete no deja la base
imposible, así que ni la consola ni las invariantes los veían. El relleno es candado porque se resuelve en la línea; el botón es ataque
porque solo el navegador dice cuál refresco se lleva lo que la persona tenía a medias (hay 306 en la web y casi todos están bien).
Felipe se lleva: un relleno nuevo sin su motivo pone el PR en rojo con un mensaje que dice qué hacer, y cada pantalla que guarda recibe en
`/chaos` la pregunta «¿lo que dice el botón quedó hecho?» (pantalla, recarga y base). ADR-0693.
