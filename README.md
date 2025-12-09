# Phidias Studio

Phidias Studio is a web-based platform for **AI-Powered 3D Asset Generation and Editing**. It features a modern chat-based interface for generating assets and a robust 3D viewer/editor for inspecting and modifying GLB files.

![Phidias Studio](./phidias_icon.jpg)

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS, Three.js (@react-three/fiber).
- **Backend**: Python, FastAPI.
- **3D Engine**: Three.js standard library (GLTFExporter, USDZExporter).

## Prerequisites

- **Node.js**: v18 or higher.
- **Python**: v3.10 or higher.

## Getting Started

To run the application locally, you need to start both the Python backend and the Next.js frontend.

### 1. Backend Setup

The backend handles API requests for model generation (currently mocked) and serves 3D assets.

```bash
cd backend

# Create a virtual environment (optional but recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn main:app --reload
```

The Backend API will be available at `http://localhost:8000`.

### 2. Frontend Setup

The frontend application provides the Chat UI and 3D Viewer.

```bash
cd frontend

# Install dependencies
npm install

# Run the development server
npm run dev
```

The Frontend will be available at `http://localhost:3000`.

## Features

- **Text-to-3D Mock**: Basic chat interface that simulates 3D generation (returning the "Emma" character).
- **3D Viewer**: High-quality rendering with OrbitControls.
- **Scene Graph Editor**: 
  - Select parts of the model.
  - **Rename** nodes.
  - **Group** selected nodes.
  - **Re-parent** nodes via Drag & Drop.
- **Export**: Download your modified scene as `.glb` or `.usdz`.
- **Import**: Direct upload of `.glb` files via the chat interface.

## Notes

- **Mock Data**: The "Generation" feature currently loads a local GLB file located in `emma-stylized-adventure-character/source/1.glb` to simulate an AI response.
