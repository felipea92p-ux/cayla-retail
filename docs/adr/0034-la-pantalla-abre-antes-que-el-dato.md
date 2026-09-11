# ADR-0034 — La pantalla abre antes que el dato: service worker para el censo

**Fecha:** 2026-09-10
**Estado:** Construido y verificado en navegador con el servidor apagado.
**Numeración:** nació como ADR-0032 en la rama `feat/taxonomia-universal`; al reconciliar
con `main` (2026-09-11) ese número ya lo tenía la idempotencia de `registrar_venta` y
pasó a 0034. Los comentarios del código (`sw.js`, `ConteoPanel`, `sin-red.ts`) ya dicen 0034.
**Corrige a:** ADR-0018, que diseñó la mitad del problema.
**Alcance elegido por Felipe (2026-09-10):** solo la pantalla de conteo, no toda la app.

## El hallazgo

ADR-0018 decidió el motor de local-first: instantánea en IndexedDB + Realtime. Resuelve
*«el dato está local»*. **No resuelve «la pantalla abre».**

Medido el 2026-09-10: cero service worker, cero `manifest.json`, cero IndexedDB en el
código, y **las 41 rutas salen `ƒ` (dinámicas) en el build** salvo `/login`. Todas las
pantallas son Server Components: el HTML lo arma Vercel en cada carga. Con el wifi caído no
llega ni el HTML, así que **ningún JavaScript nuestro llega a correr** — y da exactamente
igual lo que hubiera guardado en IndexedDB.

Las dos piezas solo sirven juntas: el service worker solo abre una pantalla vacía, y la
instantánea sola es velocidad, no autonomía.

Y `ConteoPanel` ya aguantaba la red floja mientras la pestaña siguiera viva: la página carga
todo de una vez y el panel no vuelve al servidor por cada escaneo. Lo que mata al censo es
recargar, que el equipo se duerma, o cerrar la pestaña. Eso es shell, no datos.

## La decisión

**Un service worker chico, para una sola pantalla, que cachea el DOCUMENTO del conteo.**

No hay IndexedDB, y es a propósito: el documento de `/inventario/conteo` **ya trae el
catálogo adentro**, porque el Server Component lo resolvió antes de renderizar. Guardar el
documento guarda el dato. Meter IndexedDB además sería una segunda copia del mismo catálogo,
con su propia forma de quedar desincronizada — dos fuentes de verdad para ahorrar nada.

Que la foto quede congelada no es un defecto acá: **un censo es justamente contar contra una
foto fija.** Y ADR-0027 ya permite crear prendas al vuelo, así que lo que no estaba en la
foto tiene camino.

- `/_next/static/*` → cache-first. Llevan hash: si el nombre coincide, el contenido coincide.
- documento de `/inventario/conteo` → **network-first**, caché solo cuando la red ya falló.
- todo lo demás → pasa de largo. Ni una API, ni Supabase, ni las otras 17 pantallas.

**El desastre clásico del service worker —servir una versión vieja a toda la tienda— no puede
pasar acá**: el documento va siempre a la red primero. Un despliegue nuevo se toma en la
primera carga con internet, como si el archivo no existiera.

## Lo que la prueba enseñó, y cambió el diseño

Con el servidor apagado y la máquina en red, **`navigator.onLine` seguía diciendo `true`** y
la pantalla mostraba el catálogo cacheado **sin avisar nada**. Es el caso más común en tienda
—wifi conectado a un router sin salida— y el primer diseño lo pasaba por alto.

Por eso el worker deja una marca en la caché cuando sirve desde ahí, y la pantalla la lee. Es
el único que SABE de dónde salió la respuesta. Va en la caché y no en una variable del worker
porque el navegador lo apaga y lo revive cuando quiere.

Con eso el aviso distingue dos cosas que no son la misma: **«sin internet»** (el equipo no
tiene red) y **«sin conexión con el sistema»** (el equipo tiene red, el servidor no contesta).
Decirle «sin internet» a alguien cuyo wifi funciona la manda a arreglar lo que no está roto.

El segundo hallazgo de la misma prueba: el aviso vivía solo en la rama del conteo abierto. La
pantalla volvía a abrir —el objetivo— pero callada. Y la rama SIN conteo abierto es donde más
falta hace, porque su único botón necesita servidor: ahora se deshabilita y dice por qué.

## Consecuencias

- **La cola del conteo se vacía sola.** Antes solo si alguien apretaba «Reintentar», y una
  persona escaneando 500 prendas no mira ese botón. Ahora reintenta al volver la red y al
  montar, para la cola que quedó de ayer en ese equipo.
- **Abrir un conteo sigue necesitando servidor**, y la pantalla lo dice. Es el único límite
  real, y nombrarlo vale más que esconderlo: una app que finge estar entera offline hace que
  la Encargada descubra el borde a mitad de una venta.
- **La navegación interna de Next (payload RSC) NO se cachea.** Su respuesta depende de
  cabeceras de estado del router y una caché mal emparejada ahí da pantallas a medias. Sin
  red igual no se llega desde otra pantalla, porque esa otra tampoco carga.
- **Riesgo vivo: equipo compartido.** El documento cacheado trae el catálogo y la sede de
  quien lo cargó. `LogoutButton` le manda `cayla:limpiar` al worker antes de navegar, y el
  `activate` borra toda caché que no sea de la versión viva. Si algún día se cachea una
  segunda pantalla, esto se revisa de nuevo.
- **ADR-0018 no queda anulado**: su elección de motor (Realtime sobre RLS, sin motor externo)
  sigue en pie para el día que la Fase 2 se haga completa. Lo que se corrige es el orden —
  primero abre la pantalla, después vive el dato — y que su precondición real no era medir la
  Fase 0 sino tener shell.
- **Sigue faltando todo lo demás sin red**: vender, inventario, caja. Y las dos preguntas de
  ADR-0013 §C —el umbral de «stock de sobra» y qué ve la Encargada al bloquearse— siguen
  abiertas y siguen siendo de Felipe.

## Cómo se verificó (no "debería funcionar")

Contra un build de producción (`next start`), en navegador, con sesión real:

1. Con servidor: worker activo y controlando, 17 estáticos + 1 documento en caché, **sin
   aviso** — la pantalla no habla de la red cuando no hay nada que decir.
2. **Servidor apagado y recarga completa: la pantalla abrió.** Es el objetivo entero.
3. En esa misma recarga: `navigator.onLine === true`, marca de caché presente, y el aviso
   visible — *«SIN CONEXIÓN CON EL SISTEMA — SEGUÍ CONTANDO. Estás contando contra el catálogo
   que se cargó recién. Lo que escanees se guarda en este equipo y sube solo cuando vuelva la
   red. No cierres esta pestaña.»*
4. `lib/sin-red.ts` con 10 pruebas, incluida la del caso 3, que es el que el primer diseño
   no veía.

**Lo que NO se verificó:** escanear con un conteo abierto sin red y ver la cola vaciarse al
volver. La base local tiene cero variantes, así que no hay nada que escanear sin sembrar
datos primero. Queda anotado en el BACKLOG como el paso que cierra esto de verdad.

## Addendum 2026-09-11 — la prueba con prendas, y lo que destapó

Con `supabase/seed-pruebas/catalogo-de-prueba.sql` (8 modelos, 38 variantes, códigos
acuñados por el camino real) se pudo escanear de verdad:

- **La cola sube sola.** Una prenda encolada sin red (3 unidades de `BLU-0001-NEG-M`)
  apareció en `conteo_lineas` al montar la pantalla con el servidor de vuelta, sin que
  nadie tocara nada. Verificado en la base, no en la pantalla.
- **Next caído no es Supabase caído.** Con `next start` apagado y la API local viva, el
  conteo siguió guardando: escribe directo a Supabase desde el navegador. Para simular la
  tienda sin red hay que apagar los dos (`docker stop supabase_kong_cayla-retail`). En la
  tienda real caen juntos; en la máquina de desarrollo, no.
- **Tres defectos del camino de fallo que ya existían** y que nadie había ejercitado:
  1. `contar` encolaba CUALQUIER error, también un rechazo del servidor (conteo cerrado,
     sin permiso). Con el reintento automático de este ADR, eso habría sido un rechazo
     repitiéndose cada 30 s para siempre. Ahora solo se encola el fallo de red
     (`esFalloDeRed`, exportada desde `lib/error-escritura.ts`); un rechazo se muestra y
     no se encola.
  2. Al encolar dejaba la pantalla trabada en «¿Cuántas hay?» y ponía un error rojo —«No
     se guardó nada»— justo debajo del aviso que dice «está guardada en este equipo». Dos
     frases contradictorias sobre la misma prenda. Ahora el fallo de red se comporta, para
     quien cuenta, igual que un guardado: la línea aparece, el buscador vuelve a tomar foco,
     la pistola sigue. El aviso de arriba ya dice cuántas están pendientes.
  3. «Las 1 prendas que contaste» — gramática.
- **Un latido cada 30 s mientras haya cola.** Cubre el caso que ningún evento cubre: el
  equipo tuvo wifi todo el tiempo (así que `online` nunca se dispara) y el servidor estuvo
  caído un rato. Y el botón «Reintentar ahora» ya no se esconde por la marca de caché —que
  describe cómo LLEGÓ la pantalla y se queda pegada mientras viva la pestaña— sino solo
  sin red de verdad.

**Lo que sigue sin verse en navegador:** el flujo corregido del punto 2 (escanear sin red y
ver la línea aparecer sin error rojo). La lógica está cubierta por typecheck y las pruebas
de `sin-red.ts`, y el flujo anterior sí se vio; el corregido se trabó por el arnés de
prueba —pestaña oculta, React no revela el streaming sin un frame— no por la app.
