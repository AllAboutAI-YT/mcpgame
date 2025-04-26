export interface OpenAIImageArgs {
  prompt: string;
  n?: number;
  size?: string;
  model?: string;
}

export function isValidOpenAIImageArgs(args: unknown): args is OpenAIImageArgs {
  if (!args || typeof args !== "object") {
    return false;
  }
  
  const typedArgs = args as Record<string, unknown>;
  
  if (typeof typedArgs.prompt !== "string" || !typedArgs.prompt.trim()) {
    return false;
  }
  
  if (typedArgs.n !== undefined && 
      (typeof typedArgs.n !== "number" || 
       typedArgs.n < 1 || 
       typedArgs.n > 10)) {
    return false;
  }
  
  if (typedArgs.size !== undefined && 
      typeof typedArgs.size === "string" &&
      !["256x256", "512x512", "1024x1024", "1792x1024", "1024x1792"].includes(typedArgs.size)) {
    return false;
  }
  
  if (typedArgs.model !== undefined && 
      typeof typedArgs.model === "string" &&
      !["gpt-image-1"].includes(typedArgs.model)) {
    return false;
  }
  
  return true;
}

export interface OpenAIImageResult {
  url?: string;
  b64_json?: string;
} 