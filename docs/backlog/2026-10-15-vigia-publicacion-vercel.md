## 🛰️ Vigía de Vercel: producción no se queda atrás de main en silencio (2026-10-15, ADR-0425) — solo CI, sin migración ni pantalla; rama `claude/vigia-publicacion-vercel`

- [x] `.github/workflows/vigia-vercel.yml` + `scripts/ci/vigia-vercel.mjs`: en cada push a `main` mira el último commit; sin marca de
      Vercel a los 3 min → Deploy Hook + aviso; «Canceled by Ignored Build Step» → aviso sin hook; cualquier otra marca → nada.
- [x] 19 pruebas (`scripts/ci/vigia-vercel.test.mjs`, en el paso «Qué construye Vercel» del CI): marcas reales, simulación de un commit
      sin publicación y dos corridas de punta a punta contra un GitHub falso. Cinco mutaciones del script, todas atrapadas.
- [x] Ensayo contra GitHub real (`--ensayo --sha`): decide bien `44a66cc3` (pedir), `f8c73b6d8` (filtro), `38b36abb0` (cancelada a
      mano), `c6efa0f5a` (falló), `c50f0ad92` y `bffaa7df3` (publicado).
- [ ] **Felipe:** crear el Deploy Hook (Vercel ▸ cayla-retail ▸ Settings ▸ Git ▸ Deploy Hooks, rama `main`) y guardarlo como secreto
      `VERCEL_DEPLOY_HOOK` en GitHub. Después, Actions ▸ Vigía de Vercel ▸ Run workflow ▸ «Probar el Deploy Hook».
- [ ] **Sin probar:** que un despliegue pedido por el Deploy Hook marque el commit en GitHub (la CLI sí lo hace). Lo dice la prueba de
      arriba; si no lo marca, el vigía avisaría «no veo la marca» aunque Vercel sí publique: habría que confirmar por la API de Vercel.
- [ ] La tienda online (cayla-tienda, conectada el 15-oct) no tiene vigía: otro paso con `--proyecto cayla-tienda`, su propio Deploy Hook
      y el nombre del proyecto en el título del aviso (hoy es uno solo), cuando la tienda esté en producción de verdad.
