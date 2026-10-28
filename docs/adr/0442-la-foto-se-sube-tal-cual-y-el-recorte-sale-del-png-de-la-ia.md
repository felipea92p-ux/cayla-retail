# ADR-0442 — La foto se sube tal cual, y el recorte del probador sale del PNG transparente de la IA

**Fecha:** 2026-10-17
**Estado:** Construido en la rama. `tsc`, `eslint`, `pnpm knip` y las 556 pruebas de la web en verde. El limpiador del alfa se probó con las imágenes reales
(el polo «Basic Ori» con ojal), no solo con datos de laboratorio. **Falta:** subir una foto con sesión real y mirarla en la lista de Productos, la ficha y la
tienda (ver «Riesgos»).
**Afecta:** `lib/producto-fotos.ts`, `lib/foto-encuadre.ts`, `lib/recorte-probador.ts`, `lib/recorte-probador-reglas.ts`, `lib/fotos-pendientes.ts`,
`components/ficha-producto/useSubirFotos.ts` (antes `.tsx`), `components/alta-producto/FotosAlta.tsx`, `components/vitrina/PrepararRecortesHoja.tsx`,
`proxy.ts`, `knip.ts`. **Se borran:** `components/RevisarFotosModal.tsx`, `lib/preparar-foto.ts`, `lib/foto-luz.ts`, `public/quitar-fondo.worker.js`.
**No toca la base:** sin migración, sin RPC nueva.
**Relacionado:** ADR-0228 (la preparación en el navegador, que esto reemplaza), ADR-0434 (de dónde sale el recorte, que esto cambia),
`docs/investigacion/2026-10-17-prompt-estandar-fotos-armador.md` (el prompt que usa el equipo con su IA).

## Contexto

Felipe (2026-10-17): «esa opción del sin fondo se va a quitar, ya que es la culpable de que prendas aparezcan con manchas»; «hay que quitar lo de quitar
fondo y arreglar la luz, que se suba tal cual nosotros lo subimos».

El equipo limpia cada foto con una IA externa y la IA entrega un PNG con fondo transparente real. Medido el 2026-10-17 con «Basic Ori» (POL-0034):

- La imagen que devolvió la IA estaba limpia: fuera de la prenda, alfa de 2 como máximo (invisible); el ojal con tela, como en la prenda real.
- Lo que guardó el ERP no: `foto_recortes` quedó `por_revisar` con motivo `con_fondo`, y su recorte tenía manchas claras y difusas bajo el bajo y junto a la
  cintura (se ven sobre un fondo oscuro), y el ojal medio gris.

**La causa, en `prepararFotoPrenda`:** dibujaba la imagen en un canvas SIN fondo y guardaba ese canvas como JPEG. JPEG no tiene transparencia: los píxeles
transparentes pasan a negro, así que lo guardado y lo que el recortador (MODNet) recibía era un polo blanco sobre negro. La transparencia de la IA se perdía
antes de llegar a ninguna parte, y MODNet recortaba otra vez una imagen distinta de la entregada.

## Decidí

1. **La foto se sube tal cual**: JPG, PNG o WebP de hasta 5 MB, en `fotos/<id>.<jpg|png|webp>` con la extensión de lo que es. Sin MODNet, sin corregir la luz,
   sin enfocar, sin encuadrarla en 1200×1500 y sin reducirla. Ya no hay `originales/`: la foto ES el original. Se quita `RevisarFotosModal` (el interruptor
   «Sin fondo / Con fondo», «Luz corregida / Luz original» y «Todas sin fondo / con fondo») y la descarga del modelo de 26 MB.
2. **El recorte del probador es el alfa de la propia foto.** `tieneFondoTransparente` (1 % o más de la imagen transparente) → `limpiarAlfa` → caja de la prenda
   → PNG de 1000 px de alto como máximo, igual que antes. `limpiarAlfa` no toca ningún color:
   - alfa de 32 para abajo (neblina, halo) → transparente del todo;
   - alfa de 240 para arriba (la IA suele dejar la tela en 253) → opaco del todo;
   - lo de en medio, el borde suave de 1 o 2 píxeles, se respeta;
   - las piezas sueltas menores al 15 % de la mayor se borran (`soloLaPrenda`); un conjunto de dos piezas se conserva.
3. **Una abertura del diseño no es un defecto.** El ojal y el escote llegan con alfa 255 y no se tocan. Si la prenda tiene un hueco cerrado de más del 0,5 %
   (`HUECOS_MAXIMOS`), el recorte queda `por_revisar` (motivo `huecos`) y alguien lo confirma con «Usar en el probador».
4. **Una foto sin fondo transparente (un JPG) queda «sin recorte»** y no entra al armador. Al subirla no se dice nada (no es un error); «Preparar recortes» la cuenta
   entre las que no se pudieron y dice por qué.
5. **Lo que ya existe no se toca.** Los 338 recortes hechos con MODNet siguen y los motivos `con_fondo` y `sin_original` se siguen leyendo (`textoDelMotivo`):
   hay filas de antes. Una foto subida antes (JPG de 1200×1500 sobre blanco) funciona igual que siempre.

## Medido con las imágenes reales (`limpiarAlfa` sobre el PNG de la IA, 1122×1402)

| Imagen | Píxeles semitransparentes antes → después | Huecos | Resultado |
|---|---|---|---|
| Polo con ojal, con tela detrás (la imagen buena) | 962 mil → 10 mil (0,66 %, solo el borde) | 0 % | `listo`, sin manchas |
| Polo con ojal transparente (la primera imagen) | 945 mil → 10 mil | 1,48 % | `por_revisar`, motivo `huecos` |

## Descarté

- **Dejar MODNet como respaldo para una foto sin transparencia.** Felipe: esa opción es la culpable de las manchas. Una foto así se queda sin recorte.
- **Pintar la foto de la ficha sobre blanco en 1200×1500 desde el PNG.** Felipe pidió que se suba «tal cual»; ese encuadre lo hace el prompt (4:5, con margen de
  3 %), no el ERP.
- **Un limpiador con IA o con un modelo en el navegador.** El alfa ya viene hecho; solo hay que limpiarlo.

## Riesgos (sin verificar en pantalla con sesión real)

- **Un PNG transparente en las tarjetas.** Productos, la ficha y la tienda pintan la foto sobre su propio fondo (crema, papel, hueso). Una prenda blanca o crema sobre
  un fondo claro pierde contraste, y en modo oscuro las miniaturas con `papel-fijo` siguen sobre blanco. Hay que mirar 3 a 5 prendas reales antes de subir todas.
- **Proporción.** La grilla de Productos asume 4:5 (ADR-0228). Una foto de otra proporción se ve distinta; el prompt pide 4:5.
- **5 MB.** Ya no se reduce nada: una foto cruda de celular de más de 5 MB se rechaza con el aviso (antes aguantaba hasta 25 MB). Un PNG de la IA de 1122×1402 pesa
  alrededor de 1 a 3 MB.
- **Transparencias reales de la tela.** Un encaje o un tul con alfa de 32 o menos queda borrado por `limpiarAlfa`. Si pasa en una prenda, el recorte queda
  `por_revisar` o se ve más hueco de lo real: se descarta y la prenda sigue sin recorte.
- **Las fotos nuevas ya no guardan un original aparte.** Las 463 de antes conservan el suyo en `originales/`.

## Se rompe si

- Alguien sube un JPG esperando que entre al armador: queda «sin recorte» y la lista de Vitrina ▸ Probador lo dice.
- Alguien cambia `UMBRAL_ALFA` (32) sin mirar `limpiarAlfa`, `cajaDeContenido` y `soloLaPrenda`: los tres lo comparten.

## Actualización 2026-10-18 — el color de la prenda ya no queda detrás de la foto

El primer riesgo se vio el mismo día en producción: «Blusa Burdeos de Rayas» (CMS-0073) subió como PNG transparente y la tarjeta la mostró sobre
chocolate (#4B342F), el primer color de su catálogo. No era la foto: `ImagenDePrenda` pinta `fondo` (el color de la prenda) como `backgroundColor`
para que se vea algo mientras la foto llega, y un JPG lo tapaba entero. Un PNG transparente no lo tapa nunca.

**Decidí:** el color se ve solo mientras la foto carga y se quita al cargar (`fondoDeLaFoto`, `lib/foto-prenda-reglas.ts`; se guarda por URL, igual
que «rota»). Detrás de una foto transparente queda el fondo de su tarjeta. Pendiente, como ya decía «Riesgos»: una prenda blanca o crema sobre fondo
claro, decisión de Felipe mirando prendas reales.
