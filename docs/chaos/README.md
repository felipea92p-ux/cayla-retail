# Caos — tablero

La skill `/chaos` (ADR-0356, `.claude/skills/chaos/`) usa MAL una pantalla a propósito, en local, y mira la base después de cada ataque que
escribe. Este tablero es el avance **pantalla por pantalla**. Es obligatorio **con tablero y sin prueba de CI sobre las pantallas** por ahora
(la parte pura sí corre: `scripts/chaos/*.test.mjs`): al terminar una pantalla o modal que guarda, correr `/chaos`.

**Regla del repo público:** aquí NO va ningún hallazgo de permisos ni de seguridad. Se anota «hallazgo de seguridad: ver chat» y nada más.

**Estados:** `sin atacar` · `atacada, con hallazgos abiertos` · `resiste` (corrida completa del núcleo y gravedad 1 y 2 en cero, con la
semilla anotada) · `no aplica` (solo lectura; con su motivo).

**Gravedad:** 1 estado imposible en la base · 2 dato malo guardado en silencio · 3 pantalla caída · 4 error feo pero seguro.

| Módulo | Pantalla / modal | Estado | Semilla | Hallazgos abiertos (g1 / g2 / g3 / g4) | Informe | Última corrida |
|---|---|---|---|---|---|---|
| Catálogo | Marcas (`/productos/marcas`) | **pausada**: otra sesión escribió en la base local a mitad de la corrida; corridos 6 de 18 (ENT-01, DC-01, ENT-03 300, TEC-01, TEC-06, TEC-03; PER-01 por diseño) | 20261010 | 0 / 1 / 0 / 1 | `.chaos/informes/marcas-2026-10-10.md` (fuera de git) | 2026-10-10 |
| Inventario | Ventas sin registrar, la mesa «Puente» (`/inventario/por-regularizar`) | atacada; los 4 hallazgos de gravedad 4 cerrados (2026-10-07), falta el núcleo que escribe | 7 | 0 / 0 / 0 / 0 | `.chaos/informes/ventas-sin-registrar-2026-10-07.md` (local) | 2026-10-07 |
| Compras | Plan de campaña (`/compras/plan`): la hoja de una categoría y el paso a paso guardan una línea del plan | atacada; **los 9 hallazgos arreglados en la rama y re-atacados con la misma semilla (2026-10-10)**, sin publicar: el de gravedad 2 (dos personas se pisan) necesita pegar la migración B4 en producción | 931 | 0 / 0 / 0 / 0 en local · en producción 0 / 1 / 1 / 7 hasta publicar | `.chaos/informes/plan-campana-2026-10-10.md` (local) | 2026-10-10 |

## Qué pantallas deben pasar primero (decidido 2026-10-06)
Donde un fallo es de gravedad 1: **Vender** (`/vender`, `/vender/apartados`), **Caja** (`/caja`), **Cambios** y **Devoluciones**, **Inventario**
(ajustar, recibir, bajar al piso), **Traslados** y **Conteo**, y **Compras** al recibir mercadería. Después, lo que escribe sin tocar dinero ni
stock (Catálogo, Colaboradores, Clientes). El orden dentro de un módulo sale de dónde duele más (mostrador antes que configuración).

## Cómo se agrega una fila
Al cerrar una corrida de `/chaos`: pantalla, estado, **semilla**, cuántos hallazgos quedan abiertos por gravedad (solo cuentas, nunca detalle de
seguridad), enlace al informe si lo hay (`.chaos/` es local y no se versiona: se anota la ruta y la fecha) y la fecha. No inventes un «resiste»
sin la corrida: pon «sin atacar».

## Lo que el tablero NO dice
Que una pantalla «resiste» vale para esa rama, esa semilla y los ataques que se pudieron correr (el informe termina con «No cubierto»). No
es un certificado: el catálogo crece, y una semilla nueva puede encontrar lo que la anterior no.
