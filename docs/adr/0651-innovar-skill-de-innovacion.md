# ADR-0651 · `/innovar`: una skill que compara cada pieza con lo mejor y lo más nuevo del mundo

- **Fecha:** 2026-11-13 · **Estado:** skill escrita (`.claude/skills/innovar/`), radar inicial armado (`docs/radar/`), tablero vacío
  (`docs/innovacion/README.md`). Solo documentos y skill: sin migración y sin cambios en la web.
- **Pedido:** Felipe, 2026-11-13: «crear un agente o una skill que me ayude a siempre encontrar oportunidades de mejora en cualquier cosa nueva
  que se crea, e incluso pueda auditar lo que ya se encuentra hecho; siempre tratando de innovar teniendo en cuenta lo más top y lo último en
  desarrollo de sistemas». Se decidió en 10 preguntas con opciones («Ganas / Pagas»).

## El problema

El repo ya tiene más de quince skills que auditan, y todas miden contra **lo que CAYLA ya decidió**: `/milimetro` contra las medidas y los
tokens, `/formidable` contra las nueve leyes, `/chaos` contra las invariantes, `/revision` contra las reglas y los pendientes, `/unificar` contra
la pieza elegida. Ninguna pregunta **«¿esto lo resolvería mejor alguien de afuera, o con algo que salió este año?»**. `/ultra-criterio` lo pide
en su regla 2 («compara con los mejores sistemas»), pero como criterio al diseñar, sin método ni memoria: la comparación vive en un chat y se pierde.

## Decisión

| | Elegido | Descartado |
|---|---|---|
| **Forma** | Una **skill** que por dentro lanza agentes en paralelo y un escéptico (como `/revision`) | Un agente suelto (`.claude/agents/`): no tiene comando propio, depende de que otra sesión se acuerde de llamarlo, y no se versiona con su método |
| **Qué mira** | Cuatro frentes: producto y experiencia, arquitectura y código, base y reglas, operación y calidad | Uno solo (solo UI, o solo código): Felipe eligió los cuatro |
| **Encaje** | **Solo innovación.** Lo que es de otra skill se deriva en una línea (tabla «No es nuestro») | Director que llama a las demás (caro, lento y frágil cuando una cambia) · reemplazar a `/revision` (pierde su foco en el repo) |
| **Disparo** | A mano: `/innovar <ruta \| módulo \| rama \| todo>` | Al abrir cada PR (cada PR más lento y caro) · solo programada |
| **«Lo último»** | **Radar curado** (`docs/radar/`, anillos ADOPTAR/PROBAR/EVALUAR/ESPERAR de ThoughtWorks, cada entrada con fuente y fecha), refrescado una vez por semana (Felipe pidió semanal y con Opus 5.5; al principio se había propuesto mensual); cada corrida busca en la web solo lo que el radar no cubre | Web completa en cada corrida (varias veces más cara y dos corridas dicen cosas distintas) · solo la memoria del modelo (no ve nada posterior a su corte) |
| **Audacia** | **Todas**: las de «Ahora» y las de «Visión»; ninguna mirada se autocensura, el escéptico filtra | Solo pragmáticas · solo visionarias |
| **Referentes** | Los dos grupos: retail y ERP para el **qué** (Shopify POS, Square, Lightspeed, Odoo, NetSuite) y software de primer nivel para el **cómo** (Linear, Stripe, Vercel, Apple) | Uno solo de los dos |
| **Salida** | Chat con las 3 primeras de cada horizonte + informe por corrida + tablero `docs/innovacion/README.md` con el estado de cada propuesta | Solo chat (la próxima corrida no sabe qué se descartó) · página visual por corrida (más cara) |
| **Después** | Propone y espera el OK; con él, construye en la misma sesión | Abrir una sesión por propuesta (más PR a la vez y más choques) · hacer sola lo chico |
| **Costo** | Tres modos: `rapido` (sin agentes ni web), normal (4 miradas + escéptico + radar), `profundo` (refresca el radar e investiga a fondo) | Siempre profundo · siempre normal |

**Rankeo:** impacto (1–5) × confianza (1 · 0,7 · 0,4) ÷ esfuerzo (S 1 · M 2 · L 3 · XL 5), en dos listas separadas. El impacto se mide por el
negocio (minutos de una vendedora, soles, errores de stock, clientes), nunca por lo elegante.

**Candados:** solo propone; dinero, stock, permisos y SUNAT esperan siempre el OK de Felipe; «moderno sin moda» (sin escenario real de CAYLA no
hay propuesta); sin fuente no hay referente; una idea que choca con un ADR va como **propuesta de cambio de regla**, nunca como si la regla no
existiera; un hueco de seguridad no entra a un archivo versionado (el repo es público); las búsquedas web no llevan datos de CAYLA.

## DECIDÍ / DESCARTÉ / SE ROMPE SI

- **DECIDÍ** una skill con radar curado porque la parte cara y cambiante («qué hay de nuevo») se paga una vez por semana y se reutiliza en cada
  corrida, y la parte barata y estable (el método) vive versionada en el repo.
- **DESCARTÉ** la búsqueda web completa en cada corrida: multiplica el costo, y sin una memoria común dos corridas proponen cosas contradictorias.
- **SE ROMPE SI** el radar envejece sin que nadie lo refresque: las propuestas se quedan en lo de hace meses. Por eso cada corrida mira su fecha
  y avisa con más de 14 días, y el modo `profundo` lo refresca antes de seguir.

## Lo que queda abierto

- **La rutina semanal que refresca el radar:** creada el 2026-11-13 con el OK de Felipe (cada lunes a las 9:00 de Lima, Opus 5.5, en la nube; «Radar de innovación · refresco semanal» en claude.ai/code/routines). Abre un PR solo si algo cambió y nunca lo fusiona; si la skill aún no está en `main`, se detiene sin hacer nada. Tiene tres conectores, cada uno limitado a herramientas de lectura: **Vercel** (la configuración del proyecto y los errores de ejecución de la semana, para no anunciar como novedad lo que ya está encendido), **Sentry** (los errores más frecuentes de la semana: si una novedad arregla uno, sube de anillo) y **Supabase** (solo la búsqueda en su documentación y, si ve el proyecto, sus avisos). Sin Drive, Figma ni los de Claude. Lo que vea de producción entra al radar descrito en general, sin mensajes copiados ni datos de personas (el repo es público), y un hueco de seguridad va solo en su respuesta, nunca a un archivo.
- **Sin prueba en el CI:** como `/formidable` al nacer. Si el tablero se llena de propuestas viejas sin estado, se evalúa una prueba que falle con
  filas `propuesta` de más de 90 días.
