# Escucha Motor

App Android para grabar el sonido del motor a lo largo de la vida del vehículo, guardar cada grabación como una ficha (kilometraje + motivo) y comparar dos o más fichas con un informe de diferencias y anomalías.

## Descargar
Ve a **Releases** y descarga `EscuchaMotor.apk` desde el móvil. Android pedirá permitir la instalación desde el navegador o el gestor de archivos.

## Qué analiza
- Revoluciones estimadas a partir del ritmo de explosiones (según nº de cilindros).
- Regularidad del ralentí y explosiones débiles (posibles fallos de encendido).
- Desequilibrio entre cilindros (firma subarmónica del ciclo).
- Impulsividad en agudos (taqués, distribución, picado).
- Tonos nuevos (correas, rodamientos, turbo).
- Reparto de energía por bandas y centro tonal.

Opcional: con una clave de la API de Anthropic, Claude redacta una interpretación del informe (solo se envían datos numéricos, nunca el audio).

## Compilación
GitHub Actions compila el APK en cada push a `main` (`.github/workflows/build.yml`).
La interfaz está en `app/src/main/assets/www/` y el análisis en `analysis.js`.
