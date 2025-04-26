# MCPGame

A multi-player control panel game with Node.js backend featuring a virtual house environment with interactive elements.

## Features

- 3D virtual house environment with fully rendered rooms
- Interactive TV with image generation capabilities
- Computer terminal for accessing MCP systems
- Realistic movement and collision detection
- Real-time server communication

## Setup

1. Install dependencies:
```
npm install
```

2. Run the server:
```
npm start
```
Or for development with auto-restart:
```
npm run dev
```

The server will start on port 3002.

## Game Controls

- **Movement**: WASD keys
- **Look**: Mouse movement
- **Interact**: Press ENTER when near interactive objects
- **Exit interfaces**: ESC key

## Interactive Elements

### TV System
- Approach the TV and press ENTER to access the remote control
- Generate images that will display on the TV screen

### MCP Terminal
- Find the computer desk and press ENTER to access the terminal
- Send commands to the MCP system
- Access various virtual tools (email, web search, etc.)

## Technical Details

- Built with Three.js for 3D rendering
- Express.js server for backend communication
- Canvas library for image generation
- RESTful API for server communication 