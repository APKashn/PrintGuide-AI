import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

let scene, camera, renderer, controls, currentMesh;
let modelInfo = null;
let cachedScreenshot = null; 

const sceneContainer = document.getElementById("scene-container");
const fileInput = document.getElementById("file-input");
const enterButton = document.getElementById("enterbutton");
const inputField = document.querySelector(".inputfield");
const aiStatus = document.getElementById("ai-status");
const aiOverview = document.getElementById("ai-overview");
const Reload = document.getElementById("reload");
const outputContainer = document.getElementById("output-container");

const Scroll = document.getElementById("inst"); 
const Wall = document.getElementById("wall"); 
const Audit = document.getElementById("audit"); 
const Specs = document.getElementById("boxspecs"); 
const Fulleval = document.getElementById("fulleval"); 

const Ready = document.getElementById("Ready");
const Helpdiv = document.querySelector(".how-it-works-container")
function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000010);

    camera = new THREE.PerspectiveCamera(
        45,
        sceneContainer.clientWidth / sceneContainer.clientHeight,
        0.1,
        1000
    );
    camera.position.set(100, 100, 100);

    // preserveDrawingBuffer: true allows capturing canvas screenshots with .toDataURL()
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    sceneContainer.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(1, 1, 1).normalize();
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x555555, 0.5);
    dirLight2.position.set(-1, -1, -1).normalize();
    scene.add(dirLight2);

    window.addEventListener("resize", onWindowResize);
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = sceneContainer.clientWidth / sceneContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
}

// Downsample WebGL canvas to 512x512 JPEG to drastically reduce vision tokens
function getOptimizedScreenshot() {
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    
    tempCanvas.width = 512;
    tempCanvas.height = 512;
    
    ctx.drawImage(renderer.domElement, 0, 0, 512, 512);
    
    return tempCanvas.toDataURL('image/jpeg', 0.7);
}

// Typewriter Helper Function with Dynamic Glowing Border
async function streamTextToElement(targetElement, containerElement, markdownText, speedMs = 12) {
    targetElement.innerHTML = "";
    if (containerElement) containerElement.classList.add("is-generating");

    let currentText = "";
    const chunkSize = 3; // Renders 3 characters per tick for a smooth, fast stream

    for (let i = 0; i < markdownText.length; i += chunkSize) {
        currentText += markdownText.slice(i, i + chunkSize);
        targetElement.innerHTML = marked.parse(currentText);

        if (containerElement) {
            containerElement.scrollTop = containerElement.scrollHeight;
        }

        await new Promise((resolve) => setTimeout(resolve, speedMs));
    }

    if (containerElement) containerElement.classList.remove("is-generating");
}

// Reusable STL File Handler
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = function (event) {
        const contents = event.target.result;
        const loader = new STLLoader();
        const geometry = loader.parse(contents);

        if (currentMesh) scene.remove(currentMesh);

        // Center geometry on its local origin
        geometry.computeBoundingBox();
        geometry.center();

        const material = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.4,
            metalness: 0.2
        });

        currentMesh = new THREE.Mesh(geometry, material);
        // Fix to make models render in correctly (Z-up orientation)
        currentMesh.rotation.x = -Math.PI / 2;

        scene.add(currentMesh);
        document.getElementsByClassName("upload-box")[0].style.display = "none";
        if (Reload) Reload.style.display = "flex";
        
        // Calculate size metrics
        const bbox = geometry.boundingBox;
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);

        // Position camera relative to upright model
        camera.position.set(maxDim * 1.8, maxDim * 1.8, maxDim * 1.8);
        camera.lookAt(0, 0, 0);

        modelInfo = {
            dimensions: {
                width: size.x.toFixed(2),
                height: size.y.toFixed(2),
                depth: size.z.toFixed(2)
            },
            triangles: geometry.attributes.position.count / 3,
            vertices: geometry.attributes.position.count
        };

        // Reset image cache and input UI on new model load
        cachedScreenshot = null;
        if (inputField) inputField.placeholder = "Ask something...";
        //ovbutton.style.display = "flex";
        enterButton.disabled = false;
        showToast("Model Loaded Successfully");

       // aiOverview.textContent = "";
    };
}
if (Scroll && Helpdiv) {
    Scroll.addEventListener("click", () => {
      Helpdiv.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  if (Wall) {
    Wall.addEventListener("click", () => {
        if(!enterButton.disabled) {
            inputField.value = "Analyze this model and recommend an appropriate wall thickness for 3D printing.";
        } else {showToast("Please upload a file", true);}
    });
  }
  if (Audit) {
    Audit.addEventListener("click", () => {
        if(!enterButton.disabled) {
            inputField.value = "Perform a printability audit of this model for standard FDM 3D printing. Identify potential issues and suggest improvements.";
        } else {showToast("Please upload a file", true);}
    });
  }
  
  if (Specs) {
    Specs.addEventListener("click", () => {
        if(!enterButton.disabled) {
            inputField.value = "Analyze the dimensions of this model and compare its bounding box to a standard FDM print bed. Include its overall size, required print area, and whether it will fit.";
        } else {showToast("Please upload a file", true);}
    });
  }


  if (Fulleval) {
    Fulleval.addEventListener("click", () => {
        if(!enterButton.disabled) {
            inputField.value="";
            enterButton.click();
        } else {showToast("Please upload a file", true);}
    });
  }
  


  if (Ready) {
    Ready.addEventListener("click", () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    });
  }
function showToast(message, isWarning = false) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;
  
    const iconSymbol = isWarning ? '&#10007;' : '&#10003;'; // Cross if warning, checkmark if success
    
    toast.innerHTML = `<span class="toast-icon">${iconSymbol}</span><span>${message}</span>`;
    toast.className = isWarning ? 'warning show' : 'show';
  
    setTimeout(() => {
      toast.className = toast.className.replace('show', '').trim();
    }, 3000);
  }
// Listen for file selections on the input
fileInput.addEventListener("change", handleFileSelect);

// Make the Reload button open the file selector when clicked
if (Reload) {
    Reload.addEventListener("click", () => {
        fileInput.value = ""; // Reset value so re-uploading the same file fires change event
        fileInput.click();
    });
}


// Handle Enter key submission
if (inputField) {
    inputField.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!enterButton.disabled) {
                enterButton.click();
                inputField.value="";
            } else {        showToast("Please upload a file", true);
            }
        }
    });
}

// Capture Canvas & Call Server API with Typewriter Streaming
enterButton.addEventListener("click", async () => {
    if (!currentMesh || !modelInfo) return;


    // Check if an audit was already completed for this model instance
    const isFollowUp = cachedScreenshot !== null;

    enterButton.disabled = true;
    aiStatus.textContent = isFollowUp ? "Thinking..." : "Analyzing model geometry & prompt...";
    
    if (!isFollowUp) {
        aiOverview.textContent = "";
    }

    // Generate downsampled screenshot only ONCE per loaded model
    if (!cachedScreenshot) {
        renderer.render(scene, camera);
        cachedScreenshot = getOptimizedScreenshot();
    }

    const userPromptText = inputField.value.trim();

    try {
        const response = await fetch("/api/model-overview", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                screenshot: cachedScreenshot,
                modelInfo: modelInfo,
                userPrompt: userPromptText,
                isFollowUp: isFollowUp // Explicitly flag follow-up requests
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to evaluate model.");
        }

        aiStatus.textContent = "Analysis Complete:";
        
        // Trigger Typewriter Stream & Border Glow
        inputField.value = "";

        await streamTextToElement(aiOverview, outputContainer, data.overview);
        
        // Clear input field and set placeholder for follow-up questions
        inputField.placeholder = "Ask a follow up...";

    } catch (err) {
        console.error(err);
        if (outputContainer) outputContainer.classList.remove("is-generating");
        aiStatus.textContent = "Error during analysis:";
        aiOverview.textContent = err.message;
    } finally {
        enterButton.disabled = false;
    }
});

initScene();