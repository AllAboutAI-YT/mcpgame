# OpenAI Image Generation MCP Server

This MCP (Model Context Protocol) server provides an interface to generate images using OpenAI's DALL-E image generation model.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file in the root directory with your OpenAI API key:
   ```
   OPENAI_API_KEY=your-api-key-here
   ```

3. Build the project:
   ```
   npm run build
   ```

4. Make the server executable:
   ```
   chmod +x build/index.js
   ```

5. Link the package (optional, for global access):
   ```
   npm link
   ```

## Image Storage

Generated images are automatically saved to an `image` directory in the server's working directory. Each image is saved with a filename that includes:
- Timestamp
- Simplified version of the prompt
- Image sequence number

For example: `2023-04-26T12-45-32-000Z_cat_wearing_a_space_suit_1.png`

## Usage with Claude Desktop

1. Add this server to your `claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "openai-image": {
         "command": "openai-image-server",
         "env": {
           "OPENAI_API_KEY": "your-api-key"
         }
       }
     }
   }
   ```

2. Restart Claude Desktop and look for the OpenAI image server in the 🔌 menu.

## Image Generation Tool

The server provides a single tool:

- **generate_image**: Generates images using OpenAI's DALL-E model

### Parameters:

- `prompt` (required): The text prompt to generate an image from
- `n` (optional): Number of images to generate (1-10, default: 1)
- `size` (optional): Image size (256x256, 512x512, 1024x1024, 1792x1024, or 1024x1792, default: 1024x1024)
- `model` (optional): The model to use (default: "gpt-image-1")

## Example

When connected to Claude Desktop, you can generate images with prompts like:

"Generate an image of a cat wearing a space suit on the moon" 