# ADR-0425 — El vigía del acuse: si Vercel no recibe el último commit de `main`, se lo pide el Deploy Hook

- **Fecha:** 2026-10-15 · **Estado:** aceptado (Felipe eligió «Vigía del acuse» entre tres opciones). Construido y probado; entra en
  vigor al fusionar. **Falta una cosa que solo hace Felipe:** crear el Deploy Hook en Vercel y guardarlo como secreto
  `VERCEL_DEPLOY_HOOK` (ver «Cómo se configura»). Sin el secreto, el vigía igual detecta y avisa, pero no puede pedir la publicación.
- **Pedido:** la fusión del PR #1115 (`db7ecbdd`, 19:23 UTC del 2026-10-15) nunca se publicó. Vercel no registró nada (ni una
  publicación ni una cancelación) y el commit quedó sin ninguna marca de Vercel en GitHub, aunque el CI de Actions sí corrió sobre él y
  cayla-dynamic sí publicó desde GitHub a las 19:34 y 19:58. GitHub no reintenta un aviso perdido y Vercel no sabe que existió:
  producción se queda atrás de `main` sin que nadie lo note.

## El problema (medido en GitHub y Vercel el 2026-10-15, solo lectura)

| | |
|---|---|
| Producción atrás de `main` el 15-oct | **47 min** (19:23 → 20:10 UTC, cuando alguien publicó `db7ecbdd` a mano por la CLI) |
| Cuándo marca Vercel el commit (79 fusiones recientes) | mediana **5 s**, máximo **9 s** |
| Cuándo queda publicado (las mismas 79) | mediana **2,7 min**, máximo **5,8 min** |
| Avisos perdidos desde el 1-sep | **2 de 837 fusiones** por PR: `44a66cc3` (30-sep, la tapó otra fusión 11 s después) y `db7ecbdd` |
| Filtro que se saltó producción | 9-oct, 12:55–14:13 de Lima: 6 fusiones con «Canceled by Ignored Build Step», **en verde** en GitHub |
| Publicaciones que fallaron DESPUÉS de la marca (desde el 1-oct) | 3: X roja en el commit y correo de Vercel; una (pnpm, transitoria) la repitió una persona a los 4 min |

Lo que hace daño es lo que no hace ruido. Una publicación que falla se ve: GitHub pone la X roja y Vercel manda su correo. Un aviso que
no llega y un filtro que se salta producción se ven **igual que si todo hubiera salido bien**.

Cómo se ve cada caso en la última marca de Vercel del commit (`GET /repos/…/commits/<sha>/statuses`):

| Marca | Qué pasó |
|---|---|
| ninguna | el aviso de GitHub no le llegó a Vercel |
| `pending` «Vercel is deploying your app» | en camino (también si está en fila: Vercel marca al recibir) |
| `success` «Deployment has completed» | publicado |
| `failure` «Deployment has failed…» | falló (ya avisa solo) |
| `failure` «Canceled from the Vercel Dashboard» | una persona la canceló |
| `success` «Canceled by Ignored Build Step» | **saltada por el filtro**, en verde |

**El nombre de la marca cambia, el enlace no.** Con un solo proyecto conectado al repo, Vercel la llama «Vercel»; con dos, «Vercel –
cayla-retail» (así fue de julio al 11-sep, con cayla-retail y web). El 15-oct a las 20:43 UTC se conectó **cayla-tienda**, y su marca
salió como «Vercel – cayla-tienda» mientras la del ERP seguía como «Vercel». Además hay una marca «Vercel Deployments – CAYLA», que es un
resumen del equipo y no una publicación. Por eso el vigía reconoce la marca del ERP por su enlace (`vercel.com/cayla/cayla-retail/…`), no
por el nombre. Si la reconociera por el nombre, se habría equivocado con los datos de septiembre: la primera versión de esta medición
contó como perdidas dos fusiones del 11-sep que sí estaban marcadas.

## Decisión

Un workflow, `.github/workflows/vigia-vercel.yml`, corre en cada push a `main`. Toda su lógica está en
`scripts/ci/vigia-vercel.mjs`, con sus pruebas:

1. Mira el **último commit de `main` en ese momento**, no el del push que lo despertó. Con 6 fusiones por hora y Vercel construyendo una
   versión a la vez, un commit que nunca se publicó porque llegó otro más nuevo no es una pérdida: la versión nueva lo incluye. Un push
   nuevo cancela la corrida anterior (`concurrency: vigia-vercel`), y si `main` avanza mientras espera, el vigía pasa al commit nuevo.
2. Busca la marca del proyecto en ese commit. Si la hay, **sea cual sea**, Vercel ya lo tiene y el vigía no hace nada: lo que falle
   después avisa solo. La excepción es «Canceled by Ignored Build Step», que abre un aviso sin llamar al Deploy Hook, porque el filtro
   también se saltaría lo que el hook pida.
3. Si a los **3 minutos** de creado el commit no hay marca (20 veces el máximo medido), llama una vez al **Deploy Hook**, que publica el
   último commit de `main`. Después espera otros 3 minutos a ver la marca nueva.
4. Deja un **aviso de GitHub** con el título «Producción atrás de main (vigía de Vercel)», con el commit, su PR y la hora de Lima. Si Vercel
   tomó el pedido, el aviso se abre y se cierra en el acto: queda como registro y GitHub igual notifica. Si no lo tomó (falta el secreto,
   el hook no acepta o no aparece la marca), queda abierto y la corrida sale en rojo. El primer commit que Vercel vuelva a marcar cierra
   el aviso abierto, porque trae todo lo que quedó atrás.

Lo normal cuesta una mirada de segundos, 1 minuto facturado por fusión: unos 35 minutos al día. Es gratis mientras el repo sea
público y cuesta ≈ US$ 0,28 al día si vuelve a ser privado. El Deploy Hook es un secreto del repo: la URL **es** el permiso de publicar,
así que nunca va en el código, en un aviso ni en el registro (el repo es público). Se manda solo al hook, nunca a GitHub, y el token de
GitHub nunca va al hook (lo comprueba la prueba de punta a punta).

## Las tres opciones que vio Felipe

| | Ganas | Pagas |
|---|---|---|
| **1. Vigía del acuse** (elegida) | Cubre los dos fallos silenciosos medidos; avisa en ~3 min; 1 min de Actions por fusión | Una publicación que falla después de la marca no se repite sola (ya la avisan la X roja y el correo de Vercel) |
| 2. Vigía hasta publicar | Además repite una vez una publicación caída por un tropiezo de Vercel (el del 1-oct) | ~4 min de Actions por fusión (~140 al día; ~US$ 34 al mes si el repo vuelve a privado) y el doble de casos que probar |
| 3. Ronda cada 15 min | No depende de que GitHub avise del push: cubre también si se pierde ese aviso | Detecta 15–30 min tarde (el cron de GitHub se atrasa en hora punta); ~64 min de Actions al día, haya fusiones o no |

**DECIDÍ:** vigilar el acuse de Vercel sobre el último commit de `main`, después de cada push, y pedir la publicación al Deploy Hook solo
cuando no hay ninguna marca.

**DESCARTÉ:** esperar hasta ver la publicación terminada (opción 2), porque cuadruplica el costo para cubrir un caso que ya hace ruido
solo; y la ronda programada (opción 3), porque avisa diez veces más tarde y la falla que cubre de más necesita que GitHub pierda dos avisos
del mismo push, uno a Vercel y otro a Actions. También descarté que la propia web de producción se revisara a sí misma (un cron de Vercel
que compara su commit con el de `main` y llama al hook). Eso mezcla la tienda con su forma de publicarse, necesita un token de GitHub en
producción y no funciona en el caso más grave: producción caída.

**SE ROMPE SI:**
- **GitHub pierde a la vez el aviso a Vercel y el disparo de Actions del mismo push.** Nadie mira hasta la próxima fusión, que publica
  todo. Si pasa, la opción 3 se suma como red de abajo, con el mismo script.
- **Un despliegue pedido por el Deploy Hook no marca el commit en GitHub.** El vigía diría «no veo la marca» aunque Vercel sí la tomara.
  Lo resuelve la primera prueba manual («Probar el Deploy Hook»): la publicación por la CLI del 15-oct sí marcó el commit, pero el hook no
  está probado todavía.
- **Alguien hace un rollback en Vercel a propósito.** El vigía no lo deshace, porque mira la marca del commit y no qué versión está en el
  aire. Una publicación cancelada a mano tampoco se repite.
- **Vercel cambia el formato del enlace de su marca** (`vercel.com/<equipo>/<proyecto>/<id>`). Ninguna marca se reconocería: en cada fusión el
  vigía pediría una publicación de más, no vería la marca nueva y dejaría el aviso abierto con la corrida en rojo. Es ruidoso, pero a la
  vista y sin romper nada. Se corrige en `esDelProyecto`, con la marca nueva copiada a la prueba.
- **La tienda online (cayla-tienda) pierde su aviso.** El vigía mira solo el ERP. El aviso de GitHub a Vercel es uno por push y Vercel lo
  reparte a cada proyecto, así que lo más probable es que se pierdan los dos juntos. Cubrir la tienda es otro paso en el workflow
  (`--proyecto cayla-tienda`) con su propio Deploy Hook, y el título del aviso con el nombre del proyecto: hoy es uno solo, y dos
  proyectos se cerrarían el aviso uno al otro. Queda en el backlog.

## Cómo se configura (una vez, Felipe)

1. Vercel ▸ **cayla-retail** ▸ Settings ▸ Git ▸ **Deploy Hooks**: nombre «vigia-github», rama `main` ▸ Create Hook. Copia la URL.
2. GitHub ▸ cayla-retail ▸ Settings ▸ Secrets and variables ▸ Actions ▸ **New repository secret**: nombre `VERCEL_DEPLOY_HOOK`, valor la
   URL.
3. Actions ▸ **Vigía de Vercel** ▸ Run workflow ▸ marca «Probar el Deploy Hook» ▸ Run. Vuelve a publicar `main` (~3 min en la fila de
   Vercel) y el resumen de la corrida dice si Vercel marcó el commit.

## Cómo se verifica

- `node --test scripts/ci/vigia-vercel.test.mjs` corre en el CI, en el paso «Qué construye Vercel». Son 19 pruebas:
  - las marcas reales de cada caso, copiadas de commits del repo;
  - la simulación de un **commit sin publicación**: espera 3 min, pide una sola vez, deja el aviso y lo cierra;
  - la del secreto ausente, el hook que no acepta, la marca que no aparece, el filtro, la fusión nueva mientras espera, el aviso que ya
    estaba abierto, la prueba manual, el ensayo y GitHub caído;
  - dos corridas **de punta a punta** del script real contra un GitHub y un Deploy Hook falsos en 127.0.0.1.
- Cinco cambios hechos a propósito en el script (pedir antes del plazo, aceptar la marca de la tienda, olvidar el filtro, no cerrar el
  aviso resuelto, imprimir la URL del hook) hacen fallar al menos una prueba cada uno.
- `GH_TOKEN=$(gh auth token) node scripts/ci/vigia-vercel.mjs --ensayo --sha <commit>` mira un commit real sin tocar nada. El
  2026-10-15 decidió bien en cada caso histórico: `44a66cc3` → pedir publicación; `f8c73b6d8` → filtro; `38b36abb0` → cancelada a mano, no
  se repite; `c6efa0f5a` → falló, ya avisa solo; `c50f0ad92` (marca «Vercel – cayla-retail») y `bffaa7df3` → publicado.
