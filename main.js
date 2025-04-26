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
let house, tv, computer, tvRemote; // House and interactive objects
let keysPressed = {}; // Keyboard state
const clock = new THREE.Clock();
let isTerminalOpen = false;
let isPlayerNearby = false;
let playerNearTV = false; // Flag for TV interaction
let playerNearComputer = false; // Flag for computer interaction
let messageHistory = []; // Store conversation for context
let lastCheckedImageTime = 0; // Track when we last checked for new images
let interactionType = ''; // 'tv', 'computer', or empty

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
    if (interactionType === 'tv') {
        requestNewImage();
    }
    
    // Re-enable OrbitControls
    if (controls) controls.enabled = true;
    
    // Reset interaction type
    interactionType = '';
}

// --- Input Handling ---
function handleKeyDown(event) {
    keysPressed[event.key.toLowerCase()] = true;

    if (event.key === 'Enter') {
        if (isTerminalOpen && document.activeElement === terminalInput) { 
            // If UI is open, send the query from input
            sendQuery(terminalInput.value);
        } else if (!isTerminalOpen) {
            // Check which interactive object is nearby
            if (playerNearComputer) {
                interactionType = 'computer';
                openTerminalUi();
            } else if (playerNearTV) {
                interactionType = 'tv';
                openTerminalUi();
                terminalStatus.textContent = "TV REMOTE CONTROL";
            }
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
        
        // Apply movement
        player.position.x += moveDirection.x * moveSpeed * deltaTime;
        player.position.z += moveDirection.z * moveSpeed * deltaTime;
        
        // Constrain player to inside the house
        const houseSize = 20;
        const wallThickness = 1;
        const innerSize = houseSize - wallThickness * 2;
        const halfInnerSize = innerSize / 2;
        
        player.position.x = Math.max(-halfInnerSize, Math.min(halfInnerSize, player.position.x));
        player.position.z = Math.max(-halfInnerSize, Math.min(halfInnerSize, player.position.z));
        
        // Update camera position to follow the player
        camera.position.x = player.position.x;
        camera.position.z = player.position.z + 2; // Position camera slightly behind player
        camera.lookAt(player.position.x, player.position.y, player.position.z - 5); // Look ahead of player
    }

    // Check proximity to interactive objects
    playerNearComputer = player.position.distanceTo(computer.position) < INTERACTION_DISTANCE;
    playerNearTV = player.position.distanceTo(tv.position) < INTERACTION_DISTANCE;
    
    // Update instruction text based on proximity
    const instructions = document.getElementById('instructions');
    if (playerNearComputer) {
        instructions.textContent = "Move: WASD | Look: Mouse | Press Enter to access MCP Terminal";
    } else if (playerNearTV) {
        instructions.textContent = "Move: WASD | Look: Mouse | Press Enter to use TV Remote";
    } else {
        instructions.textContent = "Move: WASD | Look: Mouse | Find Computer or TV to interact";
    }
}

// --- Game Initialization ---
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue background
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    // Add directional light (sunlight)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    scene.add(directionalLight);

    // Initialize renderer
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    
    // Initialize camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.7, 4); // Position at eye level
    
    // Controls (optional, for debugging)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI / 2 - 0.1; // Prevent going below ground
    
    // Create player object (just a simple cube for now)
    const playerGeometry = new THREE.BoxGeometry(0.5, 1.7, 0.5);
    const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    player = new THREE.Mesh(playerGeometry, playerMaterial);
    player.position.y = 0.85; // Half the player height
    scene.add(player);
    
    // Create house
    createHouse();
    
    // Create TV
    createTV();
    
    // Create computer terminal
    createComputer();
    
    // Add event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('resize', onWindowResize);
    
    // Fetch image when starting (optional)
    checkForImages();
    
    // Start animation loop
    animate();
}

function createHouse() {
    // House dimensions
    const houseSize = 20;
    const wallHeight = 4;
    const wallThickness = 1;
    
    // Create house group
    house = new THREE.Group();
    
    // Floor
    const floorGeometry = new THREE.BoxGeometry(houseSize, 0.2, houseSize);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Brown floor
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.y = -0.1; // Half its height
    floor.receiveShadow = true;
    house.add(floor);
    
    // Walls material
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xF5F5DC }); // Beige walls
    
    // North wall (with door gap)
    const northWallGeometry1 = new THREE.BoxGeometry(7, wallHeight, wallThickness);
    const northWall1 = new THREE.Mesh(northWallGeometry1, wallMaterial);
    northWall1.position.set(-6.5, wallHeight/2, -houseSize/2 + wallThickness/2);
    northWall1.castShadow = true;
    northWall1.receiveShadow = true;
    house.add(northWall1);
    
    const northWallGeometry2 = new THREE.BoxGeometry(7, wallHeight, wallThickness);
    const northWall2 = new THREE.Mesh(northWallGeometry2, wallMaterial);
    northWall2.position.set(6.5, wallHeight/2, -houseSize/2 + wallThickness/2);
    northWall2.castShadow = true;
    northWall2.receiveShadow = true;
    house.add(northWall2);
    
    // Door (decorative)
    const doorGeometry = new THREE.BoxGeometry(3, 3, 0.1);
    const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.set(0, 1, -houseSize/2 + wallThickness/2 + 0.05);
    house.add(door);
    
    // South wall
    const southWallGeometry = new THREE.BoxGeometry(houseSize, wallHeight, wallThickness);
    const southWall = new THREE.Mesh(southWallGeometry, wallMaterial);
    southWall.position.set(0, wallHeight/2, houseSize/2 - wallThickness/2);
    southWall.castShadow = true;
    southWall.receiveShadow = true;
    house.add(southWall);
    
    // East wall
    const eastWallGeometry = new THREE.BoxGeometry(wallThickness, wallHeight, houseSize);
    const eastWall = new THREE.Mesh(eastWallGeometry, wallMaterial);
    eastWall.position.set(houseSize/2 - wallThickness/2, wallHeight/2, 0);
    eastWall.castShadow = true;
    eastWall.receiveShadow = true;
    house.add(eastWall);
    
    // West wall
    const westWallGeometry = new THREE.BoxGeometry(wallThickness, wallHeight, houseSize);
    const westWall = new THREE.Mesh(westWallGeometry, wallMaterial);
    westWall.position.set(-houseSize/2 + wallThickness/2, wallHeight/2, 0);
    westWall.castShadow = true;
    westWall.receiveShadow = true;
    house.add(westWall);
    
    // Ceiling
    const ceilingGeometry = new THREE.BoxGeometry(houseSize, 0.2, houseSize);
    const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xFFF5EE }); // Off-white ceiling
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.position.y = wallHeight;
    ceiling.receiveShadow = true;
    house.add(ceiling);
    
    // Add furniture (optional)
    // Couch
    const couchGeometry = new THREE.BoxGeometry(4, 1, 1.5);
    const couchMaterial = new THREE.MeshStandardMaterial({ color: 0x6B8E23 }); // Olive green
    const couch = new THREE.Mesh(couchGeometry, couchMaterial);
    couch.position.set(0, 0.5, 8);
    couch.castShadow = true;
    couch.receiveShadow = true;
    house.add(couch);
    
    // Coffee table
    const tableGeometry = new THREE.BoxGeometry(2, 0.5, 1);
    const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Brown
    const table = new THREE.Mesh(tableGeometry, tableMaterial);
    table.position.set(0, 0.25, 6);
    table.castShadow = true;
    table.receiveShadow = true;
    house.add(table);
    
    // Add to scene
    scene.add(house);
}

function createTV() {
    // TV Stand
    const standGeometry = new THREE.BoxGeometry(3, 1, 1);
    const standMaterial = new THREE.MeshStandardMaterial({ color: 0x2F4F4F }); // Dark slate gray
    const tvStand = new THREE.Mesh(standGeometry, standMaterial);
    tvStand.position.set(0, 0.5, 4);
    tvStand.castShadow = true;
    tvStand.receiveShadow = true;
    house.add(tvStand);
    
    // TV Body
    const tvGeometry = new THREE.BoxGeometry(3, 2, 0.3);
    const tvBodyMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 }); // Black
    tv = new THREE.Mesh(tvGeometry, tvBodyMaterial);
    tv.position.set(0, 2, 4);
    tv.castShadow = true;
    house.add(tv);
    
    // TV Screen (separate mesh for the display)
    const screenGeometry = new THREE.PlaneGeometry(2.7, 1.7);
    const screenMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 }); // Dark gray by default
    imageDisplay = new THREE.Mesh(screenGeometry, screenMaterial);
    imageDisplay.position.set(0, 0, 0.16); // Slightly in front of the TV body
    tv.add(imageDisplay);
    
    // TV Remote
    const remoteGeometry = new THREE.BoxGeometry(0.3, 0.1, 0.8);
    const remoteMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 }); // Dark gray
    tvRemote = new THREE.Mesh(remoteGeometry, remoteMaterial);
    tvRemote.position.set(1, 0.3, 6); // On the coffee table
    tvRemote.castShadow = true;
    tvRemote.receiveShadow = true;
    house.add(tvRemote);
}

function createComputer() {
    // Desk
    const deskGeometry = new THREE.BoxGeometry(3, 0.8, 1.5);
    const deskMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Brown
    const desk = new THREE.Mesh(deskGeometry, deskMaterial);
    desk.position.set(-7, 0.4, 7);
    desk.castShadow = true;
    desk.receiveShadow = true;
    house.add(desk);
    
    // Computer (MCP Terminal)
    const computerGeometry = new THREE.BoxGeometry(1, 1, 0.5);
    const computerMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 }); // Dark gray
    computer = new THREE.Mesh(computerGeometry, computerMaterial);
    computer.position.set(-7, 1.3, 7); // On the desk
    computer.castShadow = true;
    house.add(computer);
    
    // Monitor
    const monitorGeometry = new THREE.BoxGeometry(1.5, 1, 0.1);
    const monitorBodyMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 }); // Black
    const monitor = new THREE.Mesh(monitorGeometry, monitorBodyMaterial);
    monitor.position.set(0, 0.7, -0.25); // In front of the computer
    computer.add(monitor);
    
    // Monitor Screen
    const screenGeometry = new THREE.PlaneGeometry(1.3, 0.8);
    const screenMaterial = new THREE.MeshBasicMaterial({ color: 0x00FF00 }); // Green terminal screen
    const screen = new THREE.Mesh(screenGeometry, screenMaterial);
    screen.position.set(0, 0, 0.06); // Slightly in front of the monitor
    monitor.add(screen);
    
    // Keyboard
    const keyboardGeometry = new THREE.BoxGeometry(1, 0.05, 0.4);
    const keyboardMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 }); // Dark gray
    const keyboard = new THREE.Mesh(keyboardGeometry, keyboardMaterial);
    keyboard.position.set(-7, 0.85, 7.4); // In front of the monitor
    keyboard.castShadow = true;
    house.add(keyboard);
    
    // Chair
    const chairSeatGeometry = new THREE.BoxGeometry(1, 0.1, 1);
    const chairMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 }); // Dark gray
    const chairSeat = new THREE.Mesh(chairSeatGeometry, chairMaterial);
    chairSeat.position.set(-7, 0.5, 8.5); // In front of the desk
    chairSeat.castShadow = true;
    chairSeat.receiveShadow = true;
    house.add(chairSeat);
    
    // Chair Back
    const chairBackGeometry = new THREE.BoxGeometry(1, 1, 0.1);
    const chairBack = new THREE.Mesh(chairBackGeometry, chairMaterial);
    chairBack.position.set(0, 0.5, -0.5); // Behind the seat
    chairSeat.add(chairBack);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = clock.getDelta();
    
    // Handle player movement
    updatePlayerMovement(deltaTime);
    
    // Update controls (if enabled)
    if (controls && controls.enabled) {
        controls.update();
    }
    
    renderer.render(scene, camera);
}

function requestNewImage() {
    // Request a new image for the TV
    fetch(`${IMAGE_SERVER_URL}/generate-image`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            prompt: "Generate a beautiful landscape scene for TV", // Default prompt
            // You could customize this with user input from terminalInput
        }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.imageUrl) {
            loadImageToDisplay(data.imageUrl);
        }
    })
    .catch(error => {
        console.error("Error generating image:", error);
    });
}

function checkForImages() {
    // Don't check too frequently
    const now = Date.now();
    if (now - lastCheckedImageTime < 2000) return; 
    lastCheckedImageTime = now;
    
    fetch(`${IMAGE_SERVER_URL}/latest-image`)
        .then(response => response.json())
        .then(data => {
            if (data.imageUrl) {
                loadImageToDisplay(data.imageUrl);
            }
        })
        .catch(error => {
            console.error("Error fetching latest image:", error);
        });
}

function loadImageToDisplay(imageUrl) {
    // Clean up previous texture if it exists
    if (currentImageTexture) {
        currentImageTexture.dispose();
    }
    
    // Create a new texture from the image URL
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
        imageUrl,
        function(texture) {
            // Store reference for cleanup
            currentImageTexture = texture;
            
            // Update the TV display with the new texture
            const newMaterial = new THREE.MeshBasicMaterial({ map: texture });
            imageDisplay.material = newMaterial;
        },
        undefined, // onProgress callback not needed
        function(error) {
            console.error("Error loading image texture:", error);
            // Fallback to a solid color if loading fails
            imageDisplay.material = new THREE.MeshBasicMaterial({ color: 0x333333 });
        }
    );
}

// Initialize the game
init();