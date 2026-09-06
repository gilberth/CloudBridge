# Comparaciones persistentes

## Objetivo

Hacer que las comparaciones del Explorer se ejecuten como operaciones persistentes y puedan revisarse desde Transfers después de navegar o recargar la aplicación.

## Diseño

Se añade `compare` al tipo de ejecución `Run`, exclusivamente para comparaciones ad-hoc (no para jobs programados). El servicio de transferencias crea el run y delega en el servicio de sistema de archivos. Al finalizar, persiste el resultado JSON de la comparación dentro de los parámetros del run y actualiza los contadores, estado y mensaje de error.

Explorer lanza la operación persistente y dirige al usuario a Transfers. Transfers identifica los runs de comparación, muestra sus diferencias y abre un diálogo de detalle con los archivos que sólo existen en origen/destino o que difieren. La comparación profunda usa el mismo flag `deep` actual y, por tanto, hashes de rclone.

## Límites

- No cambia ni borra archivos.
- No se crean jobs programados de comparación.
- El resultado se limita al formato actual `CompareResult` y se conserva junto al run.
