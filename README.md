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

# MCP Game Image System

This document explains how the image display system works in the MCP Game.

## Overview

The system displays existing images from the `server/openai-server/public/image` directory on the TV in the virtual house. Instead of generating new images, which was causing 500 Internal Server errors, the system now checks for existing images in the specified directory.

## How It Works

1. The TV in the virtual house displays images that exist in the `server/openai-server/public/image` directory.
2. The system checks for new images every 10 seconds.
3. When a user requests a new image through the TV remote interface, the system selects a random image from the directory.

## Adding New Images

To add new images to the TV:

1. Place image files (jpg, jpeg, png, gif, webp) in the `server/openai-server/public/image` directory.
2. The system will automatically detect and display them.
3. Files should be a reasonable size for web display (recommended: 800x450 pixels).

## Usage

1. Approach the TV in the virtual house.
2. Press Enter to access the TV remote control interface.
3. Type any command related to displaying images.
4. The system will select and display an image from the available ones in the directory.

## Troubleshooting

- If no images are displayed, check if the `server/openai-server/public/image` directory exists and contains image files.
- Make sure the server is running on the correct port (default: 3002).
- Check the browser console for any error messages related to image loading.

## Technical Details

- The system no longer attempts to generate images directly, avoiding the 500 Internal Server errors.
- Images are selected randomly from the directory when requested.
- The system provides appropriate feedback when no images are available.

# Connecting to MCP Backend Server

The MCPGame can connect to an external MCP Backend Server to enable advanced AI functionality for the terminal and TV interactions.

## Configuration

1. Open the `main.js` file and locate the configuration section at the top:

```javascript
// --- Configuration ---
const MCP_BACKEND_URL = 'http://localhost:3001'; // MCP Terminal backend connection
const IMAGE_SERVER_URL = 'http://localhost:3002'; // Image server connection
```

2. Update the `MCP_BACKEND_URL` to point to your MCP Backend Server:
   - For local development: `http://localhost:PORT` (replace PORT with your backend port)
   - For production: Use the full URL to your deployed backend server

## Required API Endpoints

Your MCP Backend Server should implement these endpoints:

1. `GET /api/status` - Returns the status of the MCP system
2. `POST /api/query` - Accepts user queries and returns AI responses

## Response Format

The query endpoint should return JSON in this format:

```json
{
  "response": "Text to display in the terminal",
  "spokenResponse": "Optional text for voice synthesis" 
}
```

## Testing the Connection

1. Start your MCP Backend Server
2. Start the MCPGame server (`node server.js`)
3. Open the game in a browser
4. Interact with the computer terminal in the virtual house
5. The game will connect to your MCP Backend Server when you use the terminal 