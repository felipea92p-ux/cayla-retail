# 2026-10-02 · Botones «Nuevo …» a la cabecera y color en modal

- Las hojas de tejido/patrón y etiquetas llevan «+ Nuevo …» arriba a la derecha (`<Modal acciones>`), y cada uno abre su propio modal corto (`ProponerValor`, `NuevaEtiquetaModal`).
- «+ Nuevo color» abre un modal (`NuevoColorAlta enModal`); la carta de colores se ordena SIEMPRE de más claro a más oscuro dentro de cada familia (`deClaroAOscuro`, `lib/alta-producto.ts`).
- Temporada no tiene «Nueva»: es una lista fija de la base, sin flujo de crear. Pendiente de decidir con Felipe.
