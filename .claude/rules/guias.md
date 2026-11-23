---
paths:
  - "apps/web/lib/guias/**"
  - "apps/web/guias/**"
  - "apps/web/lib/guias.test.ts"
---

## Guías interactivas: una demo por pantalla, siempre al día (regla — ADR-0389, Felipe 2026-10-07)

**Cada pantalla tiene una guía interactiva:** una demo con un velo oscuro que enciende una pieza a la vez y explica qué es y para qué
sirve, en lenguaje de tienda. Se OFRECE una sola vez por persona y por pantalla, la primera vez que entra, **solo en las entradas de su menú**
(una pantalla interna —una factura, editar un producto— no se ofrece sola; Felipe 2026-10-09); para repetirla, **Mi perfil ▸
Demo**, con «Esta pantalla» arriba (en una terminal, que no tiene perfil, el botón **«Demo» de la cabecera**) deja elegir el módulo o el submódulo. **La guía tiene que estar siempre al día:** si una pantalla gana, pierde o cambia un botón, un
campo o una pestaña, su guía cambia en el mismo PR.

**La demo NUNCA guarda.** Corre en la tienda de verdad. El piloto automático abre modales, cambia de pestaña, escribe un ejemplo sacado
de la pantalla y elige; jamás cobra, aparta, confirma ni manda nada a la base. El paso que guarda se **explica** con la pieza encendida,
sin tocarla. Lo impide el motor (`motivoParaNoTocar`, `lib/guias/reglas.ts`, que se niega a submits, enlaces a otra pantalla y a todo
control con un verbo que escribe) y lo vigila el recorredor en la red.

Cómo se hace (la skill **`/guia`** lo hace por ti):
1. Cada pieza que se explica lleva `data-guia="<pantalla>.<pieza>"` (nunca se ancla a clases ni a textos). `<Pestanas>` acepta `guia`
   (la fila) e `items[].guia` (cada pestaña).
2. Los pasos van en `apps/web/lib/guias/pantallas/<módulo>.ts`; el primero y el último, sin ancla. Título ≤ 40 letras, texto ≤ 320 (se
   entiende en 5 segundos). Un paso que depende del rol o del estado es `opcional`. Lo que la guía abre, lo cierra.
3. El tablero es `apps/web/lib/guias/registro.ts`: cada `page.tsx` está `aplicada` (con su guía), `no-aplica` (con su motivo) o
   `pendiente` (la deuda de antes de la regla: `PENDIENTES_HOY`, cuenta exacta, solo baja). **Una pantalla nueva no nace pendiente.**
4. La guía no es un módulo (ADR-0306): quien ve la pantalla ve su guía.

**Cómo se hace cumplir:**
- `lib/guias.test.ts` (con `apps/web/guias/escaner.mjs` como definición única) falla si: una pantalla nace sin guía; un paso apunta a un
  `data-guia` que no existe; un `data-guia` queda sin paso; o la **huella de controles** de una pantalla con guía
  (`lib/guias/huellas/<id>.json`) no coincide con el código. El mensaje dice qué control nació o se fue, en qué archivo y cómo seguir.
- La huella se acepta con `pnpm --filter web guias:huella <id>` **después** de revisar la guía, nunca para callar la prueba.
- `pnpm --filter web guias:recorrer -- --base-url http://localhost:<puerto>` (solo local) corre cada guía en un navegador. Falla si un
  paso no encuentra su pieza, si la demo escribe en la base o si queda un modal abierto. Saca una captura por paso, que hay que MIRAR,
  en escritorio y a 375 px.

**Hecho en TODO el ERP (2026-10-07):** 79 guías (Ventas, Inventario, Catálogo, Compras, Finanzas, Producción, Clientes, Colaboradores,
Configuración, Inicio y las sueltas), 12 pantallas `no-aplica` (rutas técnicas, hojas de impresión, redirecciones), `PENDIENTES_HOY = 0`.
Una pantalla nueva nace con su guía. Si la base local no tiene con qué mostrar una pantalla, `guias/ejemplos.mjs` lo declara (`sinDatos`) y
el recorredor la informa sin darla por rota; nunca se crean datos para una demo. La migración `20261007180000_guias_vistas.sql` («ya se la
ofrecí», por persona) está en producción desde el 2026-10-07; si la base no responde, la oferta se recuerda en el navegador. Detalle y decisiones:
`docs/adr/0389-guias-interactivas-con-mascara.md` y `.claude/skills/guia/`.
