#!/usr/bin/env node
import dotenv from "dotenv";
dotenv.config();

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
  ListToolsRequest,
  CallToolRequest
} from "@modelcontextprotocol/sdk/types.js";
import { OpenAI } from "openai";
import { OpenAIImageArgs, isValidOpenAIImageArgs } from "./types.js";
import fs from "fs";
import path from "path";

// Check for OpenAI API key
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error("ERROR: OPENAI_API_KEY environment variable is missing. Ensure it's set in the .env file.");
  process.exit(1);
}

console.error("API Key available, length:", API_KEY.length);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: API_KEY
});

// Define types for response
interface OpenAIImageData {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

interface OpenAIImageResponse {
  created: number;
  data: OpenAIImageData[];
}

// Define content types for MCP response
interface TextContent {
  type: "text";
  text: string;
}

interface ImageContent {
  type: "image";
  description: string;
  data: {
    mediaType: string;
    base64Data?: string;
  };
}

type Content = TextContent | ImageContent;

// Create two possible image directories - one in the server and one in the backend
const possiblePaths = [
  // User-specified path
  "/Users/kristianfagerlie/apps/MCPGame/server/openai-server/public/image",
  // Local path in the OpenAI server directory
  path.resolve(process.cwd(), "image"),
  // Path in the backend server
  "/Users/kristianfagerlie/apps/mcpclient2/mcp-web-client/mcp-backend-server/image",
  // Path in MCPGame directory
  "/Users/kristianfagerlie/apps/MCPGame/image"
];

let imageDir = "";
try {
  console.error("Checking possible image directories:");
  
  // First check if any of the paths exist and are writable
  for (const dirPath of possiblePaths) {
    console.error(`Checking directory: ${dirPath}`);
    
    if (fs.existsSync(dirPath)) {
      try {
        // Try writing a test file to verify permission
        const testFile = path.join(dirPath, `test-${Date.now()}.txt`);
        fs.writeFileSync(testFile, "Test write permission");
        fs.unlinkSync(testFile); // Clean up test file
        
        imageDir = dirPath;
        console.error(`Using existing writable directory: ${imageDir}`);
        break;
      } catch (err) {
        console.error(`Directory ${dirPath} exists but is not writable: ${err}`);
      }
    } else {
      console.error(`Directory ${dirPath} does not exist`);
    }
  }
  
  // If no writable directory found, try to create them in order
  if (!imageDir) {
    for (const dirPath of possiblePaths) {
      try {
        console.error(`Attempting to create directory: ${dirPath}`);
        fs.mkdirSync(dirPath, { recursive: true });
        
        // Verify it was created and is writable
        const testFile = path.join(dirPath, `test-${Date.now()}.txt`);
        fs.writeFileSync(testFile, "Test write permission");
        fs.unlinkSync(testFile); // Clean up test file
        
        imageDir = dirPath;
        console.error(`Successfully created and verified directory: ${imageDir}`);
        break;
      } catch (err) {
        console.error(`Failed to create or write to directory ${dirPath}: ${err}`);
      }
    }
  }
  
  if (!imageDir) {
    throw new Error("Could not find or create any writable image directory");
  }
  
  // Create a permanent marker file to identify this directory
  const markerFile = path.join(imageDir, "openai-image-directory.txt");
  fs.writeFileSync(markerFile, `OpenAI Image Directory created on ${new Date().toISOString()}`);
  console.error(`Created marker file at ${markerFile}`);
  
  console.error(`Final image directory: ${imageDir}`);
  
} catch (error) {
  console.error(`ERROR during image directory setup: ${error instanceof Error ? error.stack : String(error)}`);
  // Fall back to the first path if we couldn't set up any directory
  imageDir = possiblePaths[0];
  console.error(`Falling back to directory: ${imageDir}`);
}

// Create MCP server
const server = new Server({
  name: "openai-image-server",
  version: "0.1.0"
}, {
  capabilities: {
    tools: {}
  }
});

// Set up error handling
server.onerror = (error: unknown) => {
  console.error("MCP Server Error:", error);
};

process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

// Helper function to save base64 image data to a file
function saveBase64Image(base64Data: string, filename: string): string {
  try {
    console.error(`Saving base64 image data to file`);
    console.error(`Target filename: ${filename}`);
    console.error(`Target directory: ${imageDir}`);
    
    const imagePath = path.join(imageDir, filename);
    console.error(`Full path for image: ${imagePath}`);
    
    // Create the directory again just to be sure
    if (!fs.existsSync(imageDir)) {
      console.error(`Image directory doesn't exist, creating it: ${imageDir}`);
      fs.mkdirSync(imageDir, { recursive: true });
    }
    
    // Convert base64 to buffer and save
    console.error(`Converting base64 to buffer...`);
    const buffer = Buffer.from(base64Data, 'base64');
    console.error(`Image converted to buffer, size: ${buffer.length} bytes`);
    
    // Write the buffer to a file
    console.error(`Writing image buffer to file: ${imagePath}`);
    fs.writeFileSync(imagePath, buffer);
    console.error(`Image saved successfully to ${imagePath}`);
    
    // Verify file exists after saving
    if (fs.existsSync(imagePath)) {
      const stats = fs.statSync(imagePath);
      console.error(`Verified file exists: ${imagePath}, size: ${stats.size} bytes`);
    } else {
      console.error(`ERROR: Failed to verify file exists at ${imagePath}`);
    }
    
    return imagePath;
  } catch (error) {
    console.error(`ERROR while saving base64 image data: ${error instanceof Error ? error.stack : String(error)}`);
    return "";
  }
}

// Helper function to save image from URL
async function saveImageFromUrl(imageUrl: string, filename: string): Promise<string> {
  try {
    console.error(`Saving image from URL: ${imageUrl}`);
    console.error(`Target filename: ${filename}`);
    console.error(`Target directory: ${imageDir}`);
    
    const imagePath = path.join(imageDir, filename);
    console.error(`Full path for image: ${imagePath}`);
    
    // Create the directory again just to be sure
    if (!fs.existsSync(imageDir)) {
      console.error(`Image directory doesn't exist, creating it: ${imageDir}`);
      fs.mkdirSync(imageDir, { recursive: true });
    }
    
    // Fetch the image from the URL
    console.error(`Fetching image from URL...`);
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    console.error(`Image fetched successfully: ${response.status} ${response.statusText}`);
    
    // Get the image as a buffer
    console.error(`Converting image to buffer...`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.error(`Image converted to buffer, size: ${buffer.length} bytes`);
    
    // Write the buffer to a file
    console.error(`Writing image buffer to file: ${imagePath}`);
    fs.writeFileSync(imagePath, buffer);
    console.error(`Image saved successfully to ${imagePath}`);
    
    // Verify file exists after saving
    if (fs.existsSync(imagePath)) {
      const stats = fs.statSync(imagePath);
      console.error(`Verified file exists: ${imagePath}, size: ${stats.size} bytes`);
    } else {
      console.error(`ERROR: Failed to verify file exists at ${imagePath}`);
    }
    
    return imagePath;
  } catch (error) {
    console.error(`ERROR while saving image from URL: ${error instanceof Error ? error.stack : String(error)}`);
    return "";
  }
}

// Set up request handlers
server.setRequestHandler(
  ListToolsRequestSchema,
  async (_request: ListToolsRequest) => {
    console.error("Handling ListToolsRequest");
    return {
      tools: [{
        name: "generate_image",
        description: "Generate an image using OpenAI's DALL-E model",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The text prompt to generate an image from"
            },
            n: {
              type: "number",
              description: "Number of images to generate (1-10)",
              minimum: 1,
              maximum: 10,
              default: 1
            },
            size: {
              type: "string",
              description: "Image size (256x256, 512x512, 1024x1024, 1792x1024, or 1024x1792)",
              enum: ["256x256", "512x512", "1024x1024", "1792x1024", "1024x1792"],
              default: "1024x1024"
            },
            model: {
              type: "string",
              description: "The model to use for image generation",
              enum: ["gpt-image-1"],
              default: "gpt-image-1"
            }
          },
          required: ["prompt"]
        }
      }]
    };
  }
);

server.setRequestHandler(
  CallToolRequestSchema,
  async (request: CallToolRequest) => {
    console.error("Handling CallToolRequest:", JSON.stringify(request.params));

    if (request.params.name !== "generate_image") {
      console.error("ERROR: Unknown tool requested:", request.params.name);
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${request.params.name}`
      );
    }

    if (!request.params.arguments) {
      console.error("ERROR: Missing arguments");
      throw new McpError(
        ErrorCode.InvalidParams,
        "Missing arguments"
      );
    }

    if (!isValidOpenAIImageArgs(request.params.arguments)) {
      console.error("ERROR: Invalid arguments format:", JSON.stringify(request.params.arguments));
      throw new McpError(
        ErrorCode.InvalidParams,
        "Invalid arguments: prompt is required and must be a non-empty string"
      );
    }

    try {
      const { prompt, n = 1, size = "1024x1024", model = "gpt-image-1" } = request.params.arguments;
      console.error(`Generating image for prompt: "${prompt}" with model: ${model}, size: ${size}, n: ${n}`);

      // Type assertion to ensure size type is correct for OpenAI API
      const imageSize = size as "256x256" | "512x512" | "1024x1024" | "1792x1024" | "1024x1792";
      
      // Log API request parameters
      console.error(`Calling OpenAI API with parameters: model=${model}, prompt="${prompt}", n=${n}, size=${imageSize}`);
      
      // Request images from OpenAI
      const response = await openai.images.generate({
        model,
        prompt,
        n,
        size: imageSize
      }) as OpenAIImageResponse;

      console.error(`Generated images from OpenAI API. Raw response: ${JSON.stringify(response)}`);
      
      // Make sure we have a valid response format
      let imageData: OpenAIImageData[] = [];
      
      if (Array.isArray(response)) {
        // If response itself is an array
        console.error(`Response is an array with ${response.length} items`);
        imageData = response;
      } else if (response.data && Array.isArray(response.data)) {
        // Standard format
        console.error(`Response has a data array with ${response.data.length} items`);
        imageData = response.data;
      } else if (typeof response === 'string') {
        // If response is a raw string (might be base64)
        console.error(`Response is a string of length ${(response as string).length}`);
        // Create a fake image data object with the string as b64_json
        imageData = [{ b64_json: response as string }];
      } else if (typeof response === 'object') {
        // If it's a single object, wrap it
        console.error(`Response is a single object, wrapping in array`);
        imageData = [response as unknown as OpenAIImageData];
        
        // Special handler for the raw response format we saw in the error
        if ((response as any).b64_json && typeof (response as any).b64_json === 'string') {
          console.error(`Found b64_json in response object`);
          imageData = [{ b64_json: (response as any).b64_json }];
        }
      } else {
        // Last resort, create a dummy object
        console.error(`Response format unrecognized, creating empty array`);
        imageData = [];
      }
      
      console.error(`Parsed ${imageData.length} images from response`);
      console.error(`Image data structure:`, JSON.stringify(imageData.map(img => ({
        keys: Object.keys(img),
        hasB64: !!img.b64_json,
        hasB64Json: !!(img as any).b64Json,
        hasUrl: !!img.url
      }))));

      // Create timestamp for filename uniqueness
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // Create simplified prompt for filename
      const filePrompt = prompt.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
      
      // Generate filenames and save images
      const savedImagePaths: string[] = [];
      
      console.error(`Processing ${imageData.length} images for saving...`);
      
      // Process each image in the response
      for (let index = 0; index < imageData.length; index++) {
        const img = imageData[index];
        const filename = `${timestamp}_${filePrompt}_${index+1}.png`;
        
        // Debug the image data structure
        console.error(`Image ${index+1} data structure:`, JSON.stringify({
          hasB64: !!img.b64_json,
          hasB64Json: !!(img as any).b64Json,
          hasUrl: !!img.url,
          keys: Object.keys(img)
        }));
        
        // Get base64 data, trying both property names
        const base64Data = img.b64_json || (img as any).b64Json;
        
        if (base64Data) {
          // If the response contains base64 encoded image data
          console.error(`Processing image ${index+1} with base64 data (length: ${base64Data.length})`);
          const imagePath = saveBase64Image(base64Data, filename);
          if (imagePath) {
            savedImagePaths.push(imagePath);
          }
        } else if (img.url) {
          // If the response contains image URLs
          console.error(`Processing image ${index+1} with URL: ${img.url}`);
          try {
            // Make URL processing synchronous to ensure it's available for the response
            const imagePath = await saveImageFromUrl(img.url, filename);
            if (imagePath) {
              savedImagePaths.push(imagePath);
            }
          } catch (error) {
            console.error(`URL save failed for image ${index+1}: ${error}`);
          }
        } else {
          console.error(`ERROR: Image ${index+1} has neither URL nor base64 data. Raw data:`, JSON.stringify(img));
          // If we received a raw base64 string (no b64_json property)
          if (typeof img === 'object' && img !== null) {
            // Try to check for any string property that might contain base64 data
            for (const key of Object.keys(img)) {
              const value = (img as Record<string, any>)[key];
              if (typeof value === 'string' && (
                value.startsWith('data:image') || 
                /^[A-Za-z0-9+/=]+$/.test(value)
              )) {
                try {
                  let base64Data = value;
                  if (value.includes('data:image')) {
                    base64Data = value.split(',')[1];
                  }
                  console.error(`Found possible base64 data in property ${key} (length: ${base64Data.length})`);
                  const imagePath = saveBase64Image(base64Data, filename);
                  if (imagePath) {
                    savedImagePaths.push(imagePath);
                    break;
                  }
                } catch (error) {
                  console.error(`Failed to process property ${key} as base64: ${error}`);
                }
              }
            }
          }
        }
      }
      
      console.error(`Successfully saved ${savedImagePaths.length} out of ${imageData.length} images`);
      
      // Wait for any pending promises
      console.error(`Waiting for ${savedImagePaths.length} images to be saved...`);
      console.error(`Image save promises resolved with results: ${savedImagePaths.join(', ')}`);

      // Format response text including image save locations
      const responseText = `Generated ${imageData.length} image(s) for prompt: "${prompt}"\n\n` +
        imageData.map((img, i) => {
          const savedPath = i < savedImagePaths.length && savedImagePaths[i] ? 
            `\nSaved to: ${savedImagePaths[i]}` : 
            '\nWARNING: Image could not be saved locally';
          
          // Get base64 data, trying both property names
          const base64Data = img.b64_json || (img as any).b64Json;
          
          if (base64Data) {
            return `Image ${i+1}: Successfully generated${savedPath}`;
          } else if (img.url) {
            return `Image ${i+1}: Successfully generated${savedPath}\nURL: ${img.url}`;
          } else {
            return `Image ${i+1}: Failed to generate image.`;
          }
        }).join("\n\n");

      // Create content array for MCP response - only use text format for compatibility
      const contentArray: Content[] = [
        {
          type: "text",
          text: responseText
        }
      ];
      
      // Note: We're not adding the image to the content array anymore
      // The image is saved to disk and the path is included in the responseText
      console.error(`Processing complete. Returning text-only response with saved image paths.`);

      return {
        content: contentArray
      };
    } catch (error) {
      console.error("ERROR during OpenAI API call:", error instanceof Error ? error.stack : String(error));

      // Try to extract base64 data from the error message if possible
      const errorString = String(error);
      if (errorString.includes("TUyRVGQ") && errorString.length > 1000) {
        console.error("The error message appears to contain base64 data. Attempting to save it as an image.");
        
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `${timestamp}_error_recovery.png`;
          const imagePath = saveBase64Image(errorString, filename);
          
          if (imagePath) {
            return {
              content: [
                {
                  type: "text",
                  text: `Image was successfully extracted from the error response.\nSaved to: ${imagePath}`
                }
              ]
            };
          }
        } catch (saveError) {
          console.error("Failed to save base64 data from error:", saveError);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `OpenAI API error: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Start the server
async function run() {
  console.error("Starting OpenAI Image Generation MCP server");

  try {
    const transport = new StdioServerTransport();
    console.error("StdioServerTransport created");

    await server.connect(transport);
    console.error("Server connected to transport");

    console.error("OpenAI Image Generation MCP server running on stdio");
  } catch (error) {
    console.error("ERROR starting server:", error);
    process.exit(1);
  }
}

// Main execution
run().catch(error => {
  console.error("Server runtime error:", error);
  process.exit(1);
}); 