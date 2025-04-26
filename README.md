# MCPGame

A multi-player control panel game with Node.js backend featuring a virtual house environment with interactive elements.

## Features

- Immersive first-person 3D virtual house with outdoor environment
- Beautifully detailed house with interior and exterior features
- Interactive door to enter and exit the house
- Garden area with trees, plants, and decorative elements
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
- **Look around**: Mouse movement (click on game to enable)
- **Interact**: Press ENTER when near interactive objects
- **Exit interfaces**: ESC key
- **Exit mouse lock**: ESC key

## Interactive Elements

### Outdoor Environment
- Explore the terrain with trees and garden beds
- Follow the path to the house entrance
- Press ENTER when near the door to enter/exit the house

### TV System
- Approach the TV and press ENTER to access the remote control
- Generate images that will display on the TV screen
- Type a prompt for image generation in the terminal interface

### MCP Terminal
- Find the computer desk and press ENTER to access the terminal
- Send commands to the MCP system
- Access various virtual tools (email, web search, etc.)

## Technical Details

- Built with Three.js for 3D rendering
- First-person camera with pointer lock controls
- Outdoor environment with procedurally placed trees
- Express.js server for backend communication
- Canvas library for image generation
- RESTful API for server communication 