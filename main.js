import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'; // Optional for camera control

// --- Configuration ---
const MCP_BACKEND_URL = 'http://localhost:3001'; // MCP Terminal backend connection
const IMAGE_SERVER_URL = 'http://localhost:3002'; // Image server connection
const INTERACTION_DISTANCE = 3.5; // How close the player needs to be to the terminal

// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const terminalUi = document.getElementById('terminalUi');
const terminalStatus = document.getElementById('terminalStatus');
const terminalMessages = document.getElementById('terminalMessages');
const terminalInput = document.getElementById('terminalInput');

// --- State ---
let scene, camera, renderer, controls; // Three.js basics
let player, terminal, imageDisplay, currentImageTexture; // Game objects
let keysPressed = {}; // Keyboard state
const clock = new THREE.Clock();
let isTerminalOpen = false;
let isPlayerNearby = false;
let messageHistory = []; // Store conversation for context
let lastCheckedImageTime = 0; // Track when we last checked for new images

// --- Backend Interaction ---

/**
 * Fetches the connection status from the backend and updates the terminal UI.
 * Handles the new detailed status format from server.ts.
 */
async function fetchStatus() {
    try {
        terminalStatus.textContent = "Connecting to MCP Backend..."; // Initial message
        const response = await fetch(`${MCP_BACKEND_URL}/api/status`);

        if (!response.ok) {
            // Try to get error message from backend if available
            let errorMsg = `HTTP error! status: ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData && errorData.error) {
                    errorMsg += ` - ${errorData.error}`;
                }
            } catch (parseError) {
                // Ignore if response wasn't JSON or errored during parsing
                console.warn("Could not parse error response body:", parseError);
            }
            throw new Error(errorMsg);
        }

        const status = await response.json();
        console.log("Status Response:", status); // Log for debugging only

        // Just display "MCP TERMINAL" regardless of connection status
        terminalStatus.textContent = "MCP TERMINAL";

    } catch (error) {
        console.error("Error fetching status:", error);
        // Even on error, just display MCP TERMINAL
        terminalStatus.textContent = "MCP TERMINAL";
    }
}


async function sendQuery(queryText) {
    if (!queryText.trim()) return;

    addMessageToLog("You", queryText);
    terminalInput.value = ''; // Clear input

    // --- Add user message to history (Anthropic format) ---
    messageHistory.push({ role: "user", content: queryText });
    // Keep history length manageable (optional)
    if (messageHistory.length > 10) {
        messageHistory = messageHistory.slice(-10); // Keep last 10 messages
    }
    // ---

    try {
        addMessageToLog("AI", "Processing..."); // Indicate thinking

        const response = await fetch(`${MCP_BACKEND_URL}/api/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: queryText,
                history: messageHistory.slice(0, -1) // Send history *before* this query
            }),
        });

        // Remove "Processing..." message before showing result
        const thinkingMessage = terminalMessages.lastElementChild;
        if (thinkingMessage && thinkingMessage.textContent.startsWith("AI: Processing...")) {
            terminalMessages.removeChild(thinkingMessage);
        }


        if (!response.ok) {
             const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response.' })); // Gracefully handle non-JSON errors
             throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const result = await response.json(); // { response: "display text", spokenResponse: "..." }

        addMessageToLog("AI", result.response); // Use the display text

        // --- Add assistant response to history ---
         messageHistory.push({ role: "assistant", content: [{ type: "text", text: result.response }] }); // Use the correct Anthropic structure
        // ---

    } catch (error) {
        console.error("Error sending query:", error);
        addMessageToLog("Error", error.message);
         // Remove the potentially failed AI response placeholder from history if necessary
        if (messageHistory.length > 0 && messageHistory[messageHistory.length - 1].role === "assistant") {
            // This logic might need adjustment depending on exact failure point.
            // If the error happens *after* adding the user message but *before* successfully adding the assistant one,
            // we don't need to do anything here as the assistant message wasn't added.
            // If the error happened during the fetch itself, the assistant placeholder was never added.
            // Consider only adding the assistant message *after* a successful fetch.
            console.warn("Query failed, checking history consistency.");
        }
    }
}

function addMessageToLog(sender, text) {
    const messageElement = document.createElement('p');
    messageElement.textContent = `${sender}: ${text}`;
    terminalMessages.appendChild(messageElement);
    // Auto-scroll to bottom
    terminalMessages.scrollTop = terminalMessages.scrollHeight;
}

// --- Terminal UI ---
function openTerminalUi() {
    if (isTerminalOpen) return;
    isTerminalOpen = true;
    terminalUi.style.display = 'flex';
    terminalMessages.innerHTML = ''; // Clear previous messages
    messageHistory = []; // Reset history on open
    fetchStatus(); // Fetch status when opening
    terminalInput.value = '';
    terminalInput.focus(); // Focus input field
    // Optionally disable OrbitControls while UI is open
    if (controls) controls.enabled = false;
}

function closeTerminalUi() {
    if (!isTerminalOpen) return;
    isTerminalOpen = false;
    terminalUi.style.display = 'none';
    
    // Check for new images when closing the terminal
    checkForImages();
    
    // Re-enable OrbitControls
    if (controls) controls.enabled = true;
}

// --- Input Handling ---
function handleKeyDown(event) {
    keysPressed[event.key.toLowerCase()] = true;

    if (event.key === 'Enter') {
        if (isTerminalOpen && document.activeElement === terminalInput) { // Only send if input has focus
            // If UI is open, send the query from input
            sendQuery(terminalInput.value);
        } else if (!isTerminalOpen && isPlayerNearby) {
            // If UI is closed but player is near, open it
            openTerminalUi();
        }
    } else if (event.key === 'Escape') {
        if (isTerminalOpen) {
            closeTerminalUi();
        }
    }
}

function handleKeyUp(event) {
    keysPressed[event.key.toLowerCase()] = false;
}

// --- Player Movement ---
function updatePlayerMovement(deltaTime) {
    if (isTerminalOpen) return; // Don't move if UI is open

    const moveSpeed = 5.0;
    const moveDirection = new THREE.Vector3();

    if (keysPressed['w']) moveDirection.z -= 1;
    if (keysPressed['s']) moveDirection.z += 1;
    if (keysPressed['a']) moveDirection.x -= 1;
    if (keysPressed['d']) moveDirection.x += 1;

    if (moveDirection.lengthSq() > 0) {
        moveDirection.normalize();

        // Apply rotation based on camera direction (simplified)
         const cameraDirection = new THREE.Vector3();
         camera.getWorldDirection(cameraDirection);
         cameraDirection.y = 0; // Project onto XZ plane
         cameraDirection.normalize();

         const rightDirection = new THREE.Vector3().crossVectors(camera.up, cameraDirection).normalize(); // Calculate right vector

         const finalMove = new THREE.Vector3();
         finalMove.addScaledVector(cameraDirection, moveDirection.z); // Forward/backward based on camera
         finalMove.addScaledVector(rightDirection, moveDirection.x); // Left/right based on camera
         finalMove.normalize();


        player.position.addScaledVector(finalMove, moveSpeed * deltaTime);
    }
}


// --- Initialization ---
function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222233);
    scene.fog = new THREE.Fog(0x222233, 10, 40); // Add some fog

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10); // Start position looking towards origin

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true; // Enable shadows

    // Lights
    const ambientLight = new THREE.AmbientLight(0xcccccc, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Floor
    const floorGeometry = new THREE.PlaneGeometry(50, 50);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Player (Capsule shape)
    const playerRadius = 0.5;
    const playerHeight = 1.0; // Height of the cylinder part
    const playerGeometry = new THREE.CapsuleGeometry(playerRadius, playerHeight, 4, 16); // Simpler geometry
    const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    player = new THREE.Mesh(playerGeometry, playerMaterial);
    player.position.y = playerHeight / 2 + playerRadius; // Sit on the ground
    player.castShadow = true;
    scene.add(player);

    // Adjust camera to follow player slightly (simple offset)
    // Controls will handle the camera relative to the player's position
    // camera.position.set(player.position.x, player.position.y + 4, player.position.z + 6);
    // camera.lookAt(player.position);


    // Terminal
    const terminalGeometry = new THREE.BoxGeometry(1, 1.5, 0.5);
    const terminalMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
    terminal = new THREE.Mesh(terminalGeometry, terminalMaterial);
    terminal.position.set(5, 0.75, 0); // Place it somewhere
    terminal.castShadow = true;
    terminal.receiveShadow = true;
    scene.add(terminal);

    // Create the image display
    createImageDisplay();

    // Controls (Optional: OrbitControls for debugging view)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(player.position); // Target player initially
    controls.enablePan = false; // Optional: disable panning
    controls.enableZoom = true;
    controls.enableDamping = true; // Smooths rotation
    controls.dampingFactor = 0.05;
    // Lock vertical rotation somewhat
    controls.minPolarAngle = Math.PI / 4; // radians
    controls.maxPolarAngle = Math.PI / 1.8; // radians


    // Event Listeners
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('keydown', handleKeyDown, false);
    window.addEventListener('keyup', handleKeyUp, false);
    terminalInput.addEventListener('keydown', (event) => {
        // Prevent WASD from moving player when typing in terminal
        if (isTerminalOpen && ['w', 'a', 's', 'd'].includes(event.key.toLowerCase())) {
            event.stopPropagation();
        }
         // Enter key is handled by the global keydown listener now,
         // checking document.activeElement === terminalInput
    });

    // Initial camera position relative to player
    // Set camera position AFTER player and controls are initialized
    camera.position.copy(player.position);
    camera.position.add(new THREE.Vector3(0, 4, 6)); // Offset from player
    controls.update(); // Sync controls with new camera position and target


    // Start Animation Loop
    animate();
}

// --- Resize Handling ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();
    const currentTime = clock.getElapsedTime();

    // Update player movement
    updatePlayerMovement(deltaTime);
    
    // Periodically check for new images (every 10 seconds)
    if (currentTime - lastCheckedImageTime > 10) {
        lastCheckedImageTime = currentTime;
        if (!isTerminalOpen) {  // Only check if terminal is not open
            checkForImages();
        }
    }

    // Update controls
    if (controls) {
        // Update target smoothly only if player moved significantly
        // or just keep it centered always if simpler
        controls.target.copy(player.position);
        controls.update(); // Handles damping and camera updates relative to target
    }

    // Check proximity to terminal
    if (player && terminal) {
        const distance = player.position.distanceTo(terminal.position);
        isPlayerNearby = distance < INTERACTION_DISTANCE;
        // Visual feedback for interaction possibility
        terminal.material.emissive.setHex(isPlayerNearby && !isTerminalOpen ? 0x00ff00 : 0x000000); // Brighter green when nearby
    } else {
        isPlayerNearby = false; // Ensure flag is false if objects don't exist
    }

    // Render scene
    renderer.render(scene, camera);
}

// --- Image Display Functions ---
function createImageDisplay() {
    // Create a simple plane to display the image
    const geometry = new THREE.PlaneGeometry(10, 10); // Square plane for the image
    const material = new THREE.MeshBasicMaterial({ 
        color: 0xffffff,
        side: THREE.DoubleSide
    });
    
    imageDisplay = new THREE.Mesh(geometry, material);
    imageDisplay.position.set(-8, 5, 0); // Position opposite to terminal
    imageDisplay.rotation.y = Math.PI / 2; // Face toward center
    
    scene.add(imageDisplay);
    console.log("Image display created");
    
    // Immediately check for images
    checkForImages();
}

function checkForImages() {
    // Simple function to check the folder for new images (via server endpoint)
    console.log("Checking for images");
    fetch(`${IMAGE_SERVER_URL}/api/latest-image`)
        .then(response => response.json())
        .then(data => {
            if (data.latestImage) {
                console.log("Found image:", data.latestImage);
                loadImageToDisplay(`${IMAGE_SERVER_URL}/${data.latestImage}`);
            } else {
                console.log("No images found");
            }
        })
        .catch(error => {
            console.error("Error checking for images:", error);
        });
}

function loadImageToDisplay(imageUrl) {
    console.log("Loading image:", imageUrl);
    
    // Create texture loader
    const textureLoader = new THREE.TextureLoader();
    textureLoader.crossOrigin = 'anonymous';
    
    // Load the image
    textureLoader.load(
        imageUrl,
        (texture) => {
            // Success - image loaded
            console.log("Image loaded successfully");
            
            // Dispose of previous texture if it exists
            if (currentImageTexture) {
                currentImageTexture.dispose();
            }
            
            // Update the material with the new texture
            currentImageTexture = texture;
            if (imageDisplay && imageDisplay.material) {
                imageDisplay.material.map = texture;
                imageDisplay.material.needsUpdate = true;
            }
        },
        (xhr) => {
            // Progress
            console.log(`Image loading: ${Math.round((xhr.loaded / xhr.total) * 100)}% loaded`);
        },
        (error) => {
            // Error
            console.error("Error loading image:", error);
        }
    );
}

// --- Start ---
init();