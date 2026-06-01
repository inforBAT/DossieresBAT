# DOSSIERES GUI MVP

Aplicación web simple para crear un expediente de dossier arquitectónico, generar un `project_input_v2` válido y enviarlo al webhook de Make `DOSSIERES_01_INTAKE_TO_QUEUE`.

## Instalar

```bash
npm install
```

## Configurar webhook

Crea un archivo `.env.local` en la raíz del proyecto:

```bash
NEXT_PUBLIC_DOSSIERES_INTAKE_WEBHOOK_URL="https://hook.eu2.make.com/tu-webhook"
```

El botón **Enviar a Make** hace un `POST` directo al webhook con este payload:

```json
{
  "project_id": "<project.id>",
  "project_input": {}
}
```

## Ejecutar en local

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Flujo de uso

1. Rellena los datos básicos del proyecto.
2. Añade la dirección y datos catastrales del solar.
3. Registra archivos del solar y asigna categoría, label y role.
4. Añade el XLSX o CSV de encuesta.
5. Añade normativa, zona, ordenanza y plano catastral/CAD.
6. Revisa el JSON, la checklist y `requirements.missing`.
7. Copia el JSON o envíalo a Make.

La app guarda temporalmente el estado en `localStorage`. En esta versión no sube archivos físicamente a OneDrive; solo normaliza y guarda metadata con paths relativos del tipo `assets/site_photos/site_photo_001.jpg`.
