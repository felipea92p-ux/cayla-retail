# ADR-0112 — Etiquetar prendas en lote: un RPC incremental, por producto con excepciones por talla, con vista previa antes de tocar precios

**Fecha:** 2026-09-19
**Estado:** Construido y probado (21 comprobaciones SQL en un Postgres efímero, 28 pruebas de la
lógica de pantalla, pantalla verificada en navegador contra un servidor simulado).
**NO en producción**: falta pegar `20260919010000_etiquetar_variantes.sql`. Hasta entonces
`datos:comparar` marca la función como «rota en producción» — es la alarma correcta, no un falso positivo.
**Afecta:** `retail.etiquetar_variantes` (función nueva; sin cambios de tablas), `EtiquetasLista.tsx`,
`PrendasDeEtiquetaModal.tsx`, `lib/etiquetar-prendas.ts`. Continúa ADR-0107/0108.

## El problema

Producción tiene 0 de 127 variantes activas con alguna etiqueta. La única forma de etiquetar era
`actualizar_variantes_etiquetas`, dentro de «Editar producto», de a una variante y de a una pantalla:
cientos de clics para una campaña. Y esa función **reemplaza** el conjunto completo de etiquetas de
cada variante, lo que en lote significa leer, sumar y reenviar — y que dos Líderes a la vez se pisen.
Con una etiqueta que baja el precio en caja, ese pisón es dinero.

## Decisión

DECIDÍ: una función nueva, `etiquetar_variantes(p_cambios)`, que **agrega o quita UNA etiqueta a muchas
variantes sin tocar las demás etiquetas de esas variantes**: `[{etiqueta_id, agregar[], quitar[]}]`, todo
el lote o nada, idempotente, solo Líder, y solo etiquetas aprobadas y activas al agregar (quitar siempre
se permite). Devuelve lo que REALMENTE cambió. La pantalla etiqueta por **producto** (una casilla marca
todas sus tallas y colores) con excepciones por talla; lo que viaja son ids de variante, así que el
modelo por variante no cambia.

DESCARTÉ: reutilizar `actualizar_variantes_etiquetas` desde la pantalla de lote, porque exige mandar el
conjunto completo y en concurrencia el segundo guarda borra lo del primero. También descarté etiquetar
solo por variante (127 decisiones para una campaña) y solo por producto sin excepciones (no sirve para
«pieza única» ni «última talla», que fue la razón de que las etiquetas sean por variante).

SE ROMPE SI: (1) se despliega la pantalla antes de pegar el SQL — el botón «Prendas» carga pero
«Aplicar» falla con «función no existe» (orden: pegar SQL → desplegar). (2) Se etiqueta a mano un
producto cuya categoría ya está en `etiqueta_categorias` de esa misma etiqueta: no falla, pero es
redundante; la pantalla lo evita mostrándolos marcados y bloqueados («Por categoría»).

## Estados imposibles cerrados en la función (probados)
Etiquetar con una etiqueta pendiente, rechazada o inactiva · etiquetar una variante inactiva (se rechaza
TODO el lote) · la misma variante en `agregar` y `quitar` · lotes de más de 50 etiquetas o 2.000
variantes por lista · uuid mal formados (frase legible, no error crudo) · si el 2.º cambio falla, el
1.º tampoco queda. Toma `for share` sobre la etiqueta: nadie la desactiva a mitad de lote.

## Red de seguridad para el usuario (Norman)
Una etiqueta con descuento cambia precios en caja, así que antes de guardar la pantalla dice el efecto
real: «`Black Friday` baja el precio 30 % a 3 prendas · Empieza el 9 nov (en 52 días): hasta entonces
no cambia ningún precio · Por debajo del costo: 2 prendas». Sin descuento se aplica directo.
Decisión de Felipe (2026-09-19): vista previa antes de aplicar.

## No cubre (a propósito)
- **La segunda puerta:** etiquetar en lote desde `/productos` (marcar filas → «Etiquetar…»). Mismo RPC.
- **Etiquetas de rotación automáticas.** «Nuevo» (alta reciente), «Últimas unidades» (stock) y «Top ventas»
  (ventas) salen de datos que el sistema ya tiene: etiquetarlas a mano las deja viejas apenas cambia el
  stock. Van como reglas calculadas en un paso aparte, con umbrales por fijar con Felipe. Hoy las 164
  variantes tienen menos de 30 días, así que «Nuevo» marcaría todo el catálogo.
- El contador «N prendas etiquetadas a mano» sale de `variante_etiquetas` (solo Líder); si algún día pasa
  de 1.000 filas, PostgREST lo trunca y habría que contar en la base.
