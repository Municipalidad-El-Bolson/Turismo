# Turismo MEB

Aplicacion web para que establecimientos carguen ocupacion semanal y para que usuarios MEB administren cumplimiento y estadisticas.

## Stack

- Frontend: Next.js + React + TypeScript
- Backend: Python + FastAPI
- Base de datos: MongoDB

## Estructura

```text
frontend/   App Next.js
backend/    API FastAPI
docker-compose.yml
```

## Levantar con Docker

```bash
docker compose up --build
```

Frontend: http://localhost:3000  
Backend: http://localhost:8000/docs

## Levantar en desarrollo local

1. Copiar variables de entorno:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

2. Levantar MongoDB:

```bash
docker compose up -d mongodb
```

3. Instalar y correr backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

4. Instalar y correr frontend:

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:3000  
Backend: http://localhost:8000/docs

## Usuarios de ejemplo

El backend crea usuarios demo al iniciar si no existen:

- Admin MEB: usuario `admin`, contrasena `admin123`
- Establecimiento: ID `10000001`
- Establecimiento: ID `10000002`

Los nuevos establecimientos se crean desde el panel admin cargando nro. de parcela, nombre de alojamiento, direccion y telefono. El sistema genera automaticamente un ID aleatorio solo numerico; ese ID es el acceso que usa el establecimiento para cargar sus datos.

Si ya habias levantado MongoDB antes de cambiar a IDs numericos, puede que queden registros demo viejos en la base. Para arrancar limpio en desarrollo podes recrear el volumen de Docker.

## Proximos pasos sugeridos

- Agregar autenticacion real con contrasenas/JWT.
- Integrar proveedor de WhatsApp, por ejemplo Twilio o Meta WhatsApp Cloud API.
- Agregar jobs programados para recordatorios semanales.
- Definir unidades por establecimiento si se necesita cargar detalle por unidad.
