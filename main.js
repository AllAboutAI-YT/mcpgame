import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'; // Optional for camera control

// --- Configuration ---
const MCP_BACKEND_URL = 'http://localhost:3001'; // MCP Terminal backend connection
const IMAGE_SERVER_URL = 'http://localhost:3002'; // Image server connection
const INTERACTION_DISTANCE = 3.5; // How close the player needs to be to interactive objects
const PLAYER_HEIGHT = 1.7; // Player eye level in meters
const PLAYER_MOVE_SPEED = 5.0; // Movement speed
const PLAYER_TURN_SPEED = 0.03; // Mouse sensitivity
const WORLD_SIZE = 100; // Size of the outdoor terrain

// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const terminalUi = document.getElementById('terminalUi');
const terminalStatus = document.getElementById('terminalStatus');
const terminalMessages = document.getElementById('terminalMessages');
const terminalInput = document.getElementById('terminalInput');

// --- State ---
let scene, camera, renderer; // Three.js basics
let player = { position: new THREE.Vector3(0, PLAYER_HEIGHT, 20), rotation: new THREE.Euler(0, 0, 0) }; 
let imageDisplay, currentImageTexture; // Game objects
let house, tv, computer, tvRemote; // House and interactive objects
let terrain, trees = []; // Outdoor environment
let keysPressed = {}; // Keyboard state
let mouseLocked = false;
const clock = new THREE.Clock();
let isTerminalOpen = false;
let playerNearTV = false; // Flag for TV interaction
let playerNearComputer = false; // Flag for computer interaction
let playerNearDoor = false; // Flag for door interaction
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
    
    // Unlock pointer when UI is open
    if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
    }
    mouseLocked = false;
}

function closeTerminalUi() {
    if (!isTerminalOpen) return;
    isTerminalOpen = false;
    terminalUi.style.display = 'none';
    
    // Check for new images when closing the terminal
    if (interactionType === 'tv') {
        requestNewImage();
    }
    
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
            } else if (playerNearDoor) {
                // Teleport player through the door
                const houseSize = 20;
                const innerSize = houseSize - 2; // Account for wall thickness
                const isInHouseX = player.position.x >= -innerSize/2 && player.position.x <= innerSize/2;
                const isInHouseZ = player.position.z >= -innerSize/2 && player.position.z <= innerSize/2;
                const isInHouse = isInHouseX && isInHouseZ;
                
                if (isInHouse) {
                    // Move outside
                    player.position.z = -houseSize/2 - 2;
                } else {
                    // Move inside
                    player.position.z = -innerSize/2 + 1;
                }
                
                // Update camera position
                camera.position.copy(player.position);
            }
        }
    } else if (event.key === 'Escape') {
        if (isTerminalOpen) {
            closeTerminalUi();
        } else if (document.pointerLockElement === canvas) {
            document.exitPointerLock();
            mouseLocked = false;
        }
    }
}

function handleKeyUp(event) {
    keysPressed[event.key.toLowerCase()] = false;
}

function handleMouseDown(event) {
    // Only lock on left click and when UI is not open
    if (event.button === 0 && !isTerminalOpen && !mouseLocked) {
        canvas.requestPointerLock();
    }
}

function handleMouseMove(event) {
    if (document.pointerLockElement === canvas) {
        mouseLocked = true;
        // Update player rotation
        player.rotation.y -= event.movementX * PLAYER_TURN_SPEED;
        
        // Limit up/down looking to avoid flipping
        const maxVerticalLook = Math.PI / 2 - 0.1; // Just under 90 degrees
        const newVerticalAngle = camera.rotation.x + event.movementY * PLAYER_TURN_SPEED;
        camera.rotation.x = Math.max(-maxVerticalLook, Math.min(maxVerticalLook, newVerticalAngle));
    }
}

function handlePointerLockChange() {
    mouseLocked = document.pointerLockElement === canvas;
    
    // Update instructions based on pointer lock state
    updateInstructions();
}

function updateInstructions() {
    const instructions = document.getElementById('instructions');
    
    if (isTerminalOpen) {
        instructions.textContent = "Type your command and press Enter to interact";
    } else if (!mouseLocked) {
        instructions.textContent = "Click on the game to enable controls | WASD to move | ESC to release mouse";
    } else if (playerNearComputer) {
        instructions.textContent = "Press Enter to access MCP Terminal";
    } else if (playerNearTV) {
        instructions.textContent = "Press Enter to use TV Remote";
    } else if (playerNearDoor) {
        instructions.textContent = "Press Enter to enter/exit the house";
    } else {
        instructions.textContent = "WASD to move | Explore the environment";
    }
}

// --- Player Movement ---
function updatePlayerMovement(deltaTime) {
    if (isTerminalOpen || !mouseLocked) return; // Don't move if UI is open or mouse not locked

    const moveSpeed = PLAYER_MOVE_SPEED * deltaTime;
    const moveDirection = new THREE.Vector3(0, 0, 0);

    // Calculate forward direction based on player's rotation
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyEuler(player.rotation);
    
    // Calculate right direction
    const right = new THREE.Vector3(1, 0, 0);
    right.applyEuler(player.rotation);
    
    // Apply movement inputs
    if (keysPressed['w']) moveDirection.add(forward);
    if (keysPressed['s']) moveDirection.add(forward.clone().negate());
    if (keysPressed['a']) moveDirection.add(right.clone().negate());
    if (keysPressed['d']) moveDirection.add(right);

    // Normalize and apply movement if there is any
    if (moveDirection.lengthSq() > 0) {
        moveDirection.normalize();

        // Store current position before movement
        const previousPosition = player.position.clone();
        
        // Apply movement
        player.position.addScaledVector(moveDirection, moveSpeed);
        
        // Calculate world boundaries for outdoor area
        const halfWorldSize = WORLD_SIZE / 2;
        player.position.x = Math.max(-halfWorldSize, Math.min(halfWorldSize, player.position.x));
        player.position.z = Math.max(-halfWorldSize, Math.min(halfWorldSize, player.position.z));
        
        // Check if player is inside the house
        const houseSize = 20;
        const wallThickness = 1;
        const innerSize = houseSize - wallThickness * 2;
        const halfInnerSize = innerSize / 2;
        const frontDoorWidth = 3;
        
        const isInHouseX = player.position.x >= -halfInnerSize && player.position.x <= halfInnerSize;
        const isInHouseZ = player.position.z >= -halfInnerSize && player.position.z <= halfInnerSize;
        const isInHouse = isInHouseX && isInHouseZ;
        
        // Handle house collisions (ignore door area)
        if (isInHouse) {
            // We're inside the house, check collision with walls from inside
            if (Math.abs(player.position.x) > halfInnerSize - 0.3) {
                player.position.x = Math.sign(player.position.x) * (halfInnerSize - 0.3);
            }
            
            // Collision with back wall
            if (player.position.z > halfInnerSize - 0.3) {
                player.position.z = halfInnerSize - 0.3;
            }
            
            // Collision with front wall (except door)
            if (player.position.z < -halfInnerSize + 0.3 && 
                (player.position.x < -frontDoorWidth/2 || player.position.x > frontDoorWidth/2)) {
                player.position.z = -halfInnerSize + 0.3;
            }
        } else {
            // We're outside, check collision with house from outside
            const nearHouseX = player.position.x >= -houseSize/2 - 0.3 && player.position.x <= houseSize/2 + 0.3;
            const nearHouseZ = player.position.z >= -houseSize/2 - 0.3 && player.position.z <= houseSize/2 + 0.3;
            
            if (nearHouseX && nearHouseZ) {
                // We're near the house, check specific wall collisions
                // Front wall with door
                if (player.position.z < -houseSize/2 + 0.3 && player.position.z > -houseSize/2 - 0.3) {
                    // Allow entry through door
                    if (player.position.x >= -frontDoorWidth/2 && player.position.x <= frontDoorWidth/2) {
                        // Door area - no collision
                        playerNearDoor = true;
                    } else {
                        // Front wall - collision
                        player.position.z = -houseSize/2 - 0.3;
                    }
                }
                // Back wall
                else if (player.position.z > houseSize/2 - 0.3 && player.position.z < houseSize/2 + 0.3) {
                    player.position.z = houseSize/2 + 0.3;
                }
                // Left wall
                else if (player.position.x < -houseSize/2 + 0.3 && player.position.x > -houseSize/2 - 0.3) {
                    player.position.x = -houseSize/2 - 0.3;
                }
                // Right wall
                else if (player.position.x > houseSize/2 - 0.3 && player.position.x < houseSize/2 + 0.3) {
                    player.position.x = houseSize/2 + 0.3;
                }
            } else {
                playerNearDoor = false;
            }
            
            // Tree collision detection
            for (const tree of trees) {
                const treeDistance = new THREE.Vector2(player.position.x - tree.position.x, 
                                                    player.position.z - tree.position.z).length();
                if (treeDistance < 1.2) {
                    // Collision with tree, move player back
                    player.position.copy(previousPosition);
                    break;
                }
            }
        }
        
        // Update camera position to match player's eyes
        camera.position.copy(player.position);
        
        // Update camera's Y position based on whether player is inside or outside the house
        if (isInHouse) {
            // Inside the house - higher floor
            player.position.y = PLAYER_HEIGHT + 0.05;
        } else {
            // Outside - ground level
            player.position.y = PLAYER_HEIGHT;
        }
        
        // Update camera height
        camera.position.y = player.position.y;
    }

    // Check proximity to interactive objects
    playerNearComputer = player.position.distanceTo(computer.position) < INTERACTION_DISTANCE;
    playerNearTV = player.position.distanceTo(tv.position) < INTERACTION_DISTANCE;
    
    // Update instruction text based on proximity
    updateInstructions();
}

// --- Game Initialization ---
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue background
    
    // Create a sky with clouds
    createSky();
    
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
    
    // Initialize camera (first-person view)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, PLAYER_HEIGHT, 20); // Position at eye level outside the house
    camera.lookAt(0, PLAYER_HEIGHT, 0); // Look at the house
    
    // Set initial player position (start outside the house)
    player.position.set(0, PLAYER_HEIGHT, 20);
    
    // Create outdoor environment
    createTerrain();
    createTrees();
    
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
    canvas.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    
    // Fetch image when starting (optional)
    checkForImages();
    
    // Start animation loop
    animate();
}

function createSky() {
    // Create a sky dome
    const skyGeometry = new THREE.SphereGeometry(WORLD_SIZE * 0.95, 32, 32);
    const skyMaterial = new THREE.MeshBasicMaterial({
        color: 0x87CEEB, // Sky blue
        side: THREE.BackSide, // Render the inside of the sphere
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.position.y = WORLD_SIZE * 0.3; // Position slightly higher than the ground
    scene.add(sky);
    
    // Create clouds
    const clouds = [];
    const numClouds = 15;
    
    for (let i = 0; i < numClouds; i++) {
        const cloud = createCloud();
        
        // Position randomly around the sky
        const radius = WORLD_SIZE * 0.6;
        const angle = Math.random() * Math.PI * 2;
        const height = 20 + Math.random() * 20;
        
        cloud.position.set(
            Math.cos(angle) * radius,
            height,
            Math.sin(angle) * radius
        );
        
        // Random scale
        const scale = 1 + Math.random() * 2;
        cloud.scale.set(scale, scale, scale);
        
        // Random rotation
        cloud.rotation.y = Math.random() * Math.PI * 2;
        
        // Store cloud for animation
        clouds.push({
            mesh: cloud,
            speed: 0.1 + Math.random() * 0.2,
            radius: radius,
            angle: angle
        });
        
        scene.add(cloud);
    }
    
    // Store clouds in a global for animation
    scene.userData.clouds = clouds;
}

function createCloud() {
    const cloud = new THREE.Group();
    
    // Create several spheres to form a cloud
    const cloudMaterial = new THREE.MeshBasicMaterial({
        color: 0xFFFFFF, // White
        transparent: true,
        opacity: 0.8
    });
    
    // Create main cloud puffs
    const positions = [
        [0, 0, 0],
        [1, 0.2, 0.5],
        [-1, 0.3, 0.2],
        [0.5, 0.2, -0.5],
        [-0.5, 0.4, -0.3]
    ];
    
    for (const pos of positions) {
        const size = 0.8 + Math.random() * 0.5;
        const puff = new THREE.Mesh(
            new THREE.SphereGeometry(size, 8, 8),
            cloudMaterial
        );
        puff.position.set(pos[0], pos[1], pos[2]);
        cloud.add(puff);
    }
    
    return cloud;
}

function createTerrain() {
    // Create a large ground plane for the outdoor environment
    const terrainGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 32, 32);
    
    // Use a simple green texture for the ground
    const terrainMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x7CFC00, // Lawn green
        roughness: 0.8,
        metalness: 0.2
    });
    
    terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrain.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    terrain.position.y = -0.2; // Lower the terrain slightly to avoid z-fighting with house floor
    terrain.receiveShadow = true;
    scene.add(terrain);
    
    // Add a simple path leading to the house
    const pathGeometry = new THREE.PlaneGeometry(3, 25);
    const pathMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xA0522D, // Brown
        roughness: 0.9
    });
    
    const path = new THREE.Mesh(pathGeometry, pathMaterial);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, -0.19, 7.5); // Just above terrain but below house level
    path.receiveShadow = true;
    scene.add(path);
}

function createTrees() {
    // Function to create a single tree
    function createTree(x, z) {
        const treeGroup = new THREE.Group();
        
        // Tree trunk
        const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.4, 2, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Brown
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = 1; // Half the trunk height
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        treeGroup.add(trunk);
        
        // Tree leaves
        const leavesGeometry = new THREE.ConeGeometry(1.5, 3, 8);
        const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 }); // Forest green
        const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leaves.position.y = 3; // Position on top of trunk
        leaves.castShadow = true;
        leaves.receiveShadow = true;
        treeGroup.add(leaves);
        
        // Position the tree
        treeGroup.position.set(x, 0, z);
        
        // Add to scene and store reference
        scene.add(treeGroup);
        trees.push(treeGroup);
        
        return treeGroup;
    }
    
    // Create a forest of trees in a somewhat random pattern
    // avoiding the path to the house
    const numTrees = 30;
    for (let i = 0; i < numTrees; i++) {
        // Generate random positions
        let x, z;
        let isValidPosition = false;
        
        // Keep trying until we find a valid position
        while (!isValidPosition) {
            x = (Math.random() * WORLD_SIZE - WORLD_SIZE/2) * 0.8; // 80% of world size
            z = (Math.random() * WORLD_SIZE - WORLD_SIZE/2) * 0.8;
            
            // Keep trees away from the path and house
            const isAwayFromPath = Math.abs(x) > 3 || z < -10 || z > 25;
            const isAwayFromHouse = Math.sqrt(x*x + z*z) > 25 || z > 15;
            
            isValidPosition = isAwayFromPath && isAwayFromHouse;
        }
        
        createTree(x, z);
    }
}

function createHouse() {
    // House dimensions
    const houseSize = 20;
    const wallHeight = 4;
    const wallThickness = 1;
    
    // Create house group
    house = new THREE.Group();
    house.position.set(0, 0, 0); // Center of the world
    
    // Floor - Make it slightly higher and with a distinct material
    const floorGeometry = new THREE.BoxGeometry(houseSize, 0.3, houseSize);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x8B4513, // Brown floor
        roughness: 0.7,
        metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.y = 0.05; // Raise it slightly above ground level
    floor.receiveShadow = true;
    house.add(floor);
    
    // Add a floor foundation to ensure no z-fighting with terrain
    const foundationGeometry = new THREE.BoxGeometry(houseSize + 1, 0.2, houseSize + 1);
    const foundationMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 }); // Gray foundation
    const foundation = new THREE.Mesh(foundationGeometry, foundationMaterial);
    foundation.position.y = -0.1; // Slightly below floor level
    foundation.receiveShadow = true;
    house.add(foundation);
    
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
    
    // Add doorknob
    const doorknobGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const doorknobMaterial = new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.8 }); // Gold
    const doorknob = new THREE.Mesh(doorknobGeometry, doorknobMaterial);
    doorknob.position.set(0.7, 1, -houseSize/2 + wallThickness/2 + 0.11);
    house.add(doorknob);
    
    // Add door steps
    const stepsGeometry = new THREE.BoxGeometry(4, 0.2, 1);
    const stepsMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 }); // Gray steps
    const steps = new THREE.Mesh(stepsGeometry, stepsMaterial);
    steps.position.set(0, -0.1, -houseSize/2 - 0.5);
    steps.receiveShadow = true;
    house.add(steps);
    
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
    
    // Roof
    const roofGeometry = new THREE.ConeGeometry(houseSize * 0.7, 5, 4);
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x800000 }); // Maroon
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(0, wallHeight + 2.5, 0);
    roof.rotation.y = Math.PI / 4; // Rotate to align with the house
    roof.castShadow = true;
    house.add(roof);
    
    // Add windows to the walls
    function createWindow(x, z, rotationY) {
        const windowGroup = new THREE.Group();
        
        // Window frame
        const frameGeometry = new THREE.BoxGeometry(1.5, 1.5, 0.1);
        const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Brown
        const frame = new THREE.Mesh(frameGeometry, frameMaterial);
        windowGroup.add(frame);
        
        // Window glass
        const glassGeometry = new THREE.PlaneGeometry(1.3, 1.3);
        const glassMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xADD8E6, // Light blue
            transparent: true,
            opacity: 0.7
        });
        const glass = new THREE.Mesh(glassGeometry, glassMaterial);
        glass.position.z = 0.06;
        windowGroup.add(glass);
        
        // Position window
        windowGroup.position.set(x, wallHeight/2, z);
        windowGroup.rotation.y = rotationY;
        
        house.add(windowGroup);
        return windowGroup;
    }
    
    // Add windows to north wall (front)
    createWindow(-3, -houseSize/2 + wallThickness/2 + 0.06, 0);
    createWindow(3, -houseSize/2 + wallThickness/2 + 0.06, 0);
    
    // Add windows to east wall (right)
    createWindow(houseSize/2 - wallThickness/2 - 0.06, -5, Math.PI/2);
    createWindow(houseSize/2 - wallThickness/2 - 0.06, 5, Math.PI/2);
    
    // Add windows to west wall (left)
    createWindow(-houseSize/2 + wallThickness/2 + 0.06, -5, -Math.PI/2);
    createWindow(-houseSize/2 + wallThickness/2 + 0.06, 5, -Math.PI/2);
    
    // Add windows to south wall (back)
    createWindow(-5, houseSize/2 - wallThickness/2 - 0.06, Math.PI);
    createWindow(5, houseSize/2 - wallThickness/2 - 0.06, Math.PI);
    
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
    
    // Add some outdoor decorations around the house
    
    // Mailbox
    const mailboxPost = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 1, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x8B4513 }) // Brown
    );
    mailboxPost.position.set(5, 0.5, -12);
    mailboxPost.castShadow = true;
    scene.add(mailboxPost);
    
    const mailbox = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.5, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x000080 }) // Navy blue
    );
    mailbox.position.set(5, 1.3, -12);
    mailbox.castShadow = true;
    scene.add(mailbox);
    
    // Garden beds
    function createGardenBed(x, z, width, depth) {
        const bed = new THREE.Group();
        
        // Dirt area
        const dirtGeometry = new THREE.BoxGeometry(width, 0.2, depth);
        const dirtMaterial = new THREE.MeshStandardMaterial({ color: 0x654321 }); // Dark brown
        const dirt = new THREE.Mesh(dirtGeometry, dirtMaterial);
        dirt.position.y = 0.1;
        dirt.receiveShadow = true;
        bed.add(dirt);
        
        // Add some flowers
        const numFlowers = Math.floor((width * depth) / 0.5);
        for (let i = 0; i < numFlowers; i++) {
            const flowerX = (Math.random() - 0.5) * (width - 0.2);
            const flowerZ = (Math.random() - 0.5) * (depth - 0.2);
            
            // Flower stem
            const stemGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8);
            const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 }); // Forest green
            const stem = new THREE.Mesh(stemGeometry, stemMaterial);
            stem.position.set(flowerX, 0.25, flowerZ);
            stem.castShadow = true;
            bed.add(stem);
            
            // Flower head
            const flowerColor = Math.random() > 0.5 ? 0xFF0000 : 0xFFFF00; // Red or yellow
            const headGeometry = new THREE.SphereGeometry(0.08, 8, 8);
            const headMaterial = new THREE.MeshStandardMaterial({ color: flowerColor });
            const head = new THREE.Mesh(headGeometry, headMaterial);
            head.position.set(flowerX, 0.4, flowerZ);
            head.castShadow = true;
            bed.add(head);
        }
        
        bed.position.set(x, 0, z);
        scene.add(bed);
        return bed;
    }
    
    // Create garden beds on either side of the path
    createGardenBed(-4, -10, 3, 2);
    createGardenBed(4, -10, 3, 2);
    
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
    
    // Update cloud positions
    if (scene.userData.clouds) {
        for (const cloud of scene.userData.clouds) {
            // Move clouds in a circular pattern
            cloud.angle += cloud.speed * deltaTime * 0.1;
            
            cloud.mesh.position.x = Math.cos(cloud.angle) * cloud.radius;
            cloud.mesh.position.z = Math.sin(cloud.angle) * cloud.radius;
        }
    }
    
    // Handle player movement
    updatePlayerMovement(deltaTime);
    
    // Update camera rotation to match player's view direction
    camera.rotation.y = player.rotation.y;
    
    renderer.render(scene, camera);
}

function requestNewImage() {
    // Instead of generating a new image, just check for existing images
    console.log("Requesting to display a new image from existing files");
    
    // Force an immediate check for images, bypassing the time check
    lastCheckedImageTime = 0;
    checkForImages();
    
    // Add a message to the terminal if it's open
    if (isTerminalOpen) {
        addMessageToLog("System", "Checking for available images in the gallery...");
    }
}

function checkForImages() {
    // Don't check too frequently - increased to 10 seconds
    const now = Date.now();
    if (now - lastCheckedImageTime < 10000) return; 
    lastCheckedImageTime = now;
    
    console.log(`Checking for images at ${IMAGE_SERVER_URL}/latest-image`);
    
    fetch(`${IMAGE_SERVER_URL}/latest-image`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Latest image response:", data);
            
            if (data.imageUrl) {
                // New format - uses imageUrl property
                loadImageToDisplay(data.imageUrl);
            } else if (data.latestImage) {
                // Legacy format - uses latestImage property
                loadImageToDisplay(data.latestImage);
            } else {
                console.warn("No image found in response:", data);
                
                // Display a message in the terminal if open
                if (isTerminalOpen) {
                    addMessageToLog("System", "No images available in the gallery.");
                }
            }
        })
        .catch(error => {
            console.error("Error fetching latest image:", error);
            
            // Try the legacy API endpoint as fallback
            fetch(`${IMAGE_SERVER_URL}/api/latest-image`)
                .then(response => response.json())
                .then(data => {
                    console.log("Legacy image response:", data);
                    if (data.latestImage) {
                        loadImageToDisplay(data.latestImage);
                    }
                })
                .catch(fallbackError => {
                    console.error("Error fetching from legacy endpoint:", fallbackError);
                    
                    // Display a message in the terminal if open
                    if (isTerminalOpen) {
                        addMessageToLog("System", "Unable to connect to the image gallery.");
                    }
                });
        });
}

function loadImageToDisplay(imageUrl) {
    // Clean up previous texture if it exists
    if (currentImageTexture) {
        currentImageTexture.dispose();
    }
    
    // Make sure the image URL is absolute and properly formatted
    let fullImageUrl = imageUrl;
    
    // If it's just a path without domain, add the server URL
    if (imageUrl && !imageUrl.startsWith('http')) {
        // Handle both formats: with or without leading slash
        if (imageUrl.startsWith('/')) {
            fullImageUrl = `${IMAGE_SERVER_URL}${imageUrl}`;
        } else {
            fullImageUrl = `${IMAGE_SERVER_URL}/${imageUrl}`;
        }
    }
    
    console.log(`Loading image from: ${fullImageUrl}`);
    
    // Create a new texture from the image URL
    const textureLoader = new THREE.TextureLoader();
    textureLoader.crossOrigin = 'anonymous'; // Enable cross-origin loading
    
    textureLoader.load(
        fullImageUrl,
        function(texture) {
            console.log("Image loaded successfully!");
            // Store reference for cleanup
            currentImageTexture = texture;
            
            // Update the TV display with the new texture
            const newMaterial = new THREE.MeshBasicMaterial({ map: texture });
            imageDisplay.material = newMaterial;
        },
        // Progress callback
        function(xhr) {
            console.log(`Image loading: ${Math.round((xhr.loaded / xhr.total) * 100)}% loaded`);
        },
        function(error) {
            console.error("Error loading image texture:", error);
            // Fallback to a solid color if loading fails
            imageDisplay.material = new THREE.MeshBasicMaterial({ color: 0x333333 });
        }
    );
}

// Initialize the game
init();