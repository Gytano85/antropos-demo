# Conteo de barra por cámara (Capa 1 — antirrobo)

## Para qué sirve

Detectar robo de alcohol que no deja rastro en el sistema: si alguien mete su
propia botella, la venta no genera comanda y la botella no está en inventario,
pero **la bebida sí sale físicamente de la barra**. Ese es el único rastro.

El conteo físico de bebidas que cruzan la línea de la barra, cruzado contra las
comandas del mismo turno, expone la diferencia.

## Preparar los binarios

Los pesos y el runtime wasm (~52 MB) no están en git porque son reproducibles.
Tras clonar o instalar dependencias:

```bash
cd apps/web && bun run cameras:setup
```

Copia el runtime ONNX desde `node_modules` a `public/ort` y descarga el modelo
base a `public/models`. Es idempotente: no vuelve a bajar lo que ya existe.

## Arquitectura

```
cámara → canvas → YOLOv8 ONNX → candidatos → tracker → evento de cruce → BD
```

| Archivo | Responsabilidad |
| --- | --- |
| `yolo-onnx.ts` | Decodifica el tensor YOLOv8 y aplica NMS. Lógica pura. |
| `yolo-onnx-runtime.ts` | Carga la sesión ONNX (WebGPU → WASM) y preprocesa el frame. |
| `bar-models.ts` | Registro de modelos y su orden de clases. |
| `bar-service-detector.ts` | Mapea clases del modelo a `plate/glass/bottle/can`. |
| `bar-service-tracker.ts` | Sigue objetos entre frames y emite el cruce de línea. |

## Cambiar al modelo especializado de bebidas

El sistema arranca con `yolov8n.onnx` (COCO, genérico). Detecta botella, copa y
vaso, pero **no distingue latas** porque COCO no tiene esa clase.

Para mejorarlo, usa el modelo [Beverage Containers][beverage] (YOLOv8n, 15.6k
imágenes, 9 clases de recipientes de bebida, mAP@50 95%):

1. Descarga el dataset desde Roboflow (cuenta gratuita) y entrena una vez:

   ```python
   !pip install ultralytics roboflow

   from roboflow import Roboflow
   rf = Roboflow(api_key="TU_API_KEY")
   project = rf.workspace("roboflow-universe-projects").project("beverage-containers-3atxb")
   dataset = project.version(3).download("yolov8")

   from ultralytics import YOLO
   model = YOLO("yolov8n.pt")
   model.train(data=f"{dataset.location}/data.yaml", epochs=50, imgsz=640)
   model.export(format="onnx", opset=12, simplify=True)
   ```

2. Copia el resultado a `apps/web/public/models/beverage-containers.onnx`.

3. **Verifica el orden de clases.** Abre el `data.yaml` generado y compara su
   lista `names` contra `BEVERAGE_MODEL_CLASSES` en `bar-service-detector.ts`.
   El índice de cada clase viene del orden de esa lista: si no coinciden, el
   detector confundirá latas con copas sin dar ningún error.

No hace falta tocar código: `resolveAvailableBarModel()` prefiere el modelo de
bebidas en cuanto el archivo existe y cae al genérico si no está.

## Por qué las bebidas se cuentan como un solo grupo

El detector alterna de clase sobre un mismo objeto físico (un vaso alto y una
botella se parecen). Antes, ese cambio rompía el track y creaba uno nuevo, y el
objeto **se contaba dos veces** — inaceptable en un sistema que puede motivar
un despido.

Ahora `itemGroup()` agrupa `glass`, `bottle` y `can` como `drink`: el
seguimiento sobrevive al cambio de clase (con una penalización suave en el
costo de emparejamiento) y el objeto se cuenta una sola vez. Los platos quedan
en su propio grupo y nunca se emparejan con bebidas.

## Advertencias

- **Licencia:** la arquitectura YOLOv8 es de Ultralytics y está bajo AGPL-3.0,
  cuyo copyleft se dispara al servir el producto por red. Para un POS comercial
  cerrado hay que revisar esto — la alternativa limpia es reentrenar el mismo
  dataset sobre RT-DETR (Apache 2.0).
- **Uso:** trátalo como alerta para revisión humana, no como acusación
  automática; el conteo por cámara siempre tiene margen de error.
- **Aviso al personal:** en México la videovigilancia laboral requiere informar
  a los trabajadores. Además te protege si el caso escala.

[beverage]: https://universe.roboflow.com/roboflow-universe-projects/beverage-containers-3atxb
