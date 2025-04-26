const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3002;

// Enable CORS for all routes
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'server/openai-server/public')));

// API routes
app.get('/api/status', (req, res) => {
    // Example response - you'll replace this with your actual MCP status
    res.json({
        overallConnected: true,
        connectionDetails: [
            {
                path: 'email-server/index.js',
                status: 'connected',
                tools: ['send_email', 'get_recent_emails', 'read_email', 'search_emails']
            },
            {
                path: 'gemini-server/index.js',
                status: 'connected',
                tools: ['generate-text']
            },
            {
                path: 'web-server/index.js',
                status: 'connected',
                tools: ['web_search']
            }
        ],
        availableTools: [
            'web_search', 'generate-text', 'send_email', 
            'get_recent_emails', 'read_email', 'search_emails'
        ]
    });
});

// New endpoint for displaying existing images from the directory
app.post('/generate-image', async (req, res) => {
    console.log("Image request received - redirecting to display existing images");
    
    try {
        // Get the latest image from the directory and return its URL
        const imageDir = path.join(__dirname, 'server/openai-server/public/image');
        
        // Ensure directory exists
        if (!fs.existsSync(imageDir)) {
            fs.mkdirSync(imageDir, { recursive: true });
            return res.status(404).json({
                success: false,
                message: 'No images available yet'
            });
        }
        
        // Get image files
        const files = fs.readdirSync(imageDir);
        const imageFiles = files.filter(file => 
            /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
        );
        
        if (imageFiles.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No image files found'
            });
        }
        
        // Get a random image from the directory to simulate "generating" a new one
        const randomIndex = Math.floor(Math.random() * imageFiles.length);
        const randomImageFile = imageFiles[randomIndex];
        const imageUrl = `/image/${randomImageFile}`;
        
        res.json({
            success: true,
            message: 'Image found successfully',
            imageUrl: imageUrl
        });
    } catch (err) {
        console.error("Error handling image request:", err);
        res.status(500).json({
            success: false,
            message: 'Error handling image request',
            error: err.message
        });
    }
});

// Updated endpoint to get the latest image
app.get('/latest-image', (req, res) => {
    console.log("Latest image request received");
    
    // Get the image directory
    const imageDir = path.join(__dirname, 'server/openai-server/public/image');
    console.log("Looking for images in directory:", imageDir);
    
    try {
        // Check if directory exists
        if (!fs.existsSync(imageDir)) {
            console.log("Directory doesn't exist, creating it");
            fs.mkdirSync(imageDir, { recursive: true });
            return res.json({ 
                success: false,
                message: 'No images available - directory was just created',
                imageUrl: null
            });
        }
        
        // Get all files in the directory
        const files = fs.readdirSync(imageDir);
        console.log("All files in directory:", files);
        
        // Filter image files
        const imageFiles = files.filter(file => 
            /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
        );
        console.log("Image files found:", imageFiles);
        
        if (imageFiles.length === 0) {
            return res.json({ 
                success: false,
                message: 'No image files found in directory',
                imageUrl: null
            });
        }
        
        // Sort by modification time (most recent first)
        imageFiles.sort((a, b) => {
            const statA = fs.statSync(path.join(imageDir, a));
            const statB = fs.statSync(path.join(imageDir, b));
            return statB.mtime.getTime() - statA.mtime.getTime();
        });
        
        // Get the most recent image
        const latestImageFile = imageFiles[0];
        console.log("Latest image file:", latestImageFile);
        
        // Return the most recent image path
        const imageUrl = '/image/' + latestImageFile;
        
        res.json({ 
            success: true,
            message: 'Latest image found',
            imageUrl: imageUrl,
            totalImages: imageFiles.length
        });
    } catch (err) {
        console.error("Error finding latest image:", err);
        res.status(500).json({ 
            success: false,
            message: 'Error finding latest image', 
            error: err.message
        });
    }
});

// Legacy endpoint for API compatibility
app.get('/api/latest-image', (req, res) => {
    console.log("Legacy API request for latest image");
    
    // Get the image directory
    const imageDir = path.join(__dirname, 'server/openai-server/public/image');
    
    try {
        // Check if directory exists
        if (!fs.existsSync(imageDir)) {
            fs.mkdirSync(imageDir, { recursive: true });
            return res.json({ message: 'No images found - directory was just created', latestImage: null });
        }
        
        // Get all files in the directory
        const files = fs.readdirSync(imageDir);
        
        // Filter image files
        const imageFiles = files.filter(file => 
            /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
        );
        
        if (imageFiles.length === 0) {
            return res.json({ message: 'No image files found in directory', latestImage: null });
        }
        
        // Sort by modification time (most recent first)
        imageFiles.sort((a, b) => {
            const statA = fs.statSync(path.join(imageDir, a));
            const statB = fs.statSync(path.join(imageDir, b));
            return statB.mtime.getTime() - statA.mtime.getTime();
        });
        
        // Get the most recent image
        const latestImageFile = imageFiles[0];
        
        // Return the most recent image path
        const latestImagePath = 'image/' + latestImageFile;
        
        res.json({ 
            message: 'Latest image found',
            latestImage: latestImagePath,
            totalImages: imageFiles.length
        });
    } catch (err) {
        console.error("Error finding latest image:", err);
        res.status(500).json({ 
            message: 'Error finding latest image', 
            error: err.message,
            latestImage: null
        });
    }
});

// Endpoint to handle image generation queries
app.post('/api/query', (req, res) => {
    // For now, just echo back what was sent
    // In a real implementation, this would pass the query to appropriate MCP tools
    const responseText = "I received your message. If you ask me to display an image, I'll show one from the gallery!";
    
    res.json({
        response: responseText,
        spokenResponse: responseText
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 