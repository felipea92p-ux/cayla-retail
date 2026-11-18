# Plantilla del informe de `/innovar`

Archivo: `docs/innovacion/AAAA-MM-DD-<slug>.md`. Se llena en español, en lenguaje de tienda donde se habla del negocio.

```markdown
# Innovar · <qué se auditó> — AAAA-MM-DD

- **Alcance:** <ruta | módulo | rama | todo> · **Modo:** rápido | normal | profundo
- **SHA analizado:** `<sha de origin/main>` · **Radar usado:** <fecha de docs/radar/README.md> <(viejo: más de 14 días) si aplica>
- **Corrieron:** miradas A B C D + escéptico | pasada rápida — sin escéptico, puede traer ideas que no aguantan
- **Resultado:** <n> propuestas (<n> Ahora · <n> Visión) · <n> descartadas · <n> derivadas

## Qué es y qué problema resuelve hoy
<un párrafo en lenguaje de tienda>

## Ahora — lo que se construye con el stack de hoy
| # | Propuesta | Para quién | Referente | Impacto | Esfuerzo | Confianza | Puntaje |
|---|---|---|---|---|---|---|---|
| <slug>#1 | … | vendedora | Shopify POS | 4 | S | Alta | 4,0 |

## Visión — las apuestas grandes
(misma tabla)

## Detalle de cada propuesta
### <slug>#1 · <título>  ·  Ahora · impacto 4 · esfuerzo S · confianza Alta
- **Hoy:** cómo se hace, con `archivo:línea`.
- **Propuesta:** qué cambia, con archivo, tabla o función.
- **El momento que mejora:** el escenario del negocio.
- **Cómo lo hacen los mejores:** <referente> — <cómo> ([fuente](url), fecha).
- **Lo que lo habilita:** <entrada del radar, si aplica>.
- **DECIDÍ** … · **DESCARTÉ** … · **SE ROMPE SI** …
- **Primer paso:** lo más chico que la demuestra funcionando.
- <⚠ Toca lo delicado (dinero / stock / permisos / SUNAT): espera el OK de Felipe>  <↻ Cambia la regla de ADR-XXXX: …>
- **Veredicto del escéptico:** se queda | se queda con cambios (qué cambió).

## Para otras skills
- `/chaos`: … (una línea cada una)

## Descartadas (para que nadie las vuelva a proponer)
| Propuesta | Por qué no |
|---|---|

## Lo que no se miró
- …
```

**Fila del tablero** (`docs/innovacion/README.md`), una por propuesta que se queda:

`| <slug>#<n> | <módulo> | <título corto> | Ahora/Visión | <impacto>/<esfuerzo> | propuesta | [informe](AAAA-MM-DD-<slug>.md) | AAAA-MM-DD |`

Estados: `propuesta` → `aceptada` (Felipe dijo sí) → `hecha` (con el PR) · `descartada por Felipe` (con el motivo, si lo dio) · `vencida` (lo
que la habilitaba cambió; se vuelve a evaluar).
