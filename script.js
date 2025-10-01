// SmartAttend - Vanilla JavaScript Implementation
// Converting from React to maintain exact same functionality

// Global State Management
const state = {
  currentMode: 'home',
  currentTab: 'face',
  currentIdTab: 'qr',
  isRegistering: false,
  user: null,
  camera: {
    stream: null,
    isActive: false,
    isProcessing: false,
    capturedImage: null,
    detectionStatus: 'idle'
  },
  qrScanner: {
    scanner: null,
    isScanning: false
  },
  attendanceRecords: []
};

// Utility Functions
function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return document.querySelectorAll(selector);
}

function addClass(element, className) {
  if (element) element.classList.add(className);
}

function removeClass(element, className) {
  if (element) element.classList.remove(className);
}

function toggleClass(element, className) {
  if (element) element.classList.toggle(className);
}

function hasClass(element, className) {
  return element ? element.classList.contains(className) : false;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date) {
  return date.toLocaleDateString();
}

// Toast Notification System
class ToastManager {
  constructor() {
    this.container = $('#toast-container');
    this.toasts = [];
  }

  show({ title, description, variant = 'default', duration = 4000, action = null }) {
    const toast = document.createElement('div');
    toast.className = `toast ${variant} animate-slide-in-right`;

    let actionHtml = '';
    if (action) {
      actionHtml = `<div class="toast-action">${action.outerHTML}</div>`;
    }

    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        ${description ? `<div class="toast-description">${description}</div>` : ''}
      </div>
      ${actionHtml}
    `;

    // Re-attach event listeners for action button
    if (action) {
      const actionBtn = toast.querySelector('.toast-action button');
      if (actionBtn && action.onclick) {
        actionBtn.onclick = action.onclick;
      }
    }

    this.container.appendChild(toast);
    this.toasts.push(toast);

    // Auto remove after specified duration
    setTimeout(() => {
      this.remove(toast);
    }, duration);

    return toast;
  }

  remove(toast) {
    if (toast && toast.parentNode) {
      toast.style.animation = 'slide-out-right 0.3s ease-out';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
        const index = this.toasts.indexOf(toast);
        if (index > -1) {
          this.toasts.splice(index, 1);
        }
      }, 300);
    }
  }

  success(title, description) {
    return this.show({ title, description, variant: 'success' });
  }

  error(title, description) {
    return this.show({ title, description, variant: 'error' });
  }
}

const toast = new ToastManager();

// Screen Management
function switchMode(mode) {
  // Hide all screens
  $$('.screen').forEach(screen => removeClass(screen, 'active'));
  
  // Update state
  state.currentMode = mode;
  
  // Show appropriate screen
  switch (mode) {
    case 'home':
      addClass($('#home-screen'), 'active');
      resetAllStates();
      break;
    case 'mark-attendance':
      state.isRegistering = false;
      updateAuthScreen();
      addClass($('#auth-screen'), 'active');
      break;
    case 'register':
      state.isRegistering = true;
      updateAuthScreen();
      addClass($('#auth-screen'), 'active');
      break;
    case 'dashboard':
      addClass($('#dashboard-screen'), 'active');
      initializeDashboard();
      break;
    case 'my-attendance':
      addClass($('#my-attendance-screen'), 'active');
      initializeMyAttendance();
      break;
    case 'generate-qr':
      addClass($('#generate-qr-screen'), 'active');
      initializeGenerateQR();
      break;
  }
}

function updateAuthScreen() {
  const title = $('#auth-title');
  const subtitle = $('#auth-subtitle');
  const faceTitle = $('#face-title');
  const faceSubtitle = $('#face-subtitle');

  if (state.isRegistering) {
    title.textContent = 'Register Your Biometrics';
    subtitle.textContent = 'Set up your face recognition and ID for future attendance';
    faceTitle.textContent = 'Register Your Face';
    faceSubtitle.textContent = 'Position your face in the camera view and capture';
  } else {
    title.textContent = 'Mark Your Attendance';
    subtitle.textContent = 'Choose your preferred authentication method';
    faceTitle.textContent = 'Face Authentication';
    faceSubtitle.textContent = 'Look at the camera to mark attendance';
  }

  // Reset camera and scanner states
  resetCameraState();
  resetIdScanner();
}

// Tab Management
function switchTab(tabName) {
  state.currentTab = tabName;
  
  // Update tab buttons
  $$('.tab').forEach(tab => removeClass(tab, 'active'));
  $$('.tab-content').forEach(content => removeClass(content, 'active'));
  
  // Activate selected tab
  const tabButton = Array.from($$('.tab')).find(t => 
    t.textContent.toLowerCase().includes(tabName === 'face' ? 'face' : 'id')
  );
  const tabContent = $(`#${tabName}-tab`);
  
  if (tabButton) addClass(tabButton, 'active');
  if (tabContent) addClass(tabContent, 'active');

  // Reset states when switching tabs
  if (tabName === 'face') {
    resetCameraState();
  } else {
    stopCamera();
    resetIdScanner();
  }
}

function switchIdTab(tabName) {
  state.currentIdTab = tabName;
  
  // Update ID tab buttons
  $$('.id-tab').forEach(tab => removeClass(tab, 'active'));
  $$('.id-tab-content').forEach(content => removeClass(content, 'active'));
  
  // Activate selected ID tab
  const idTabButton = Array.from($$('.id-tab')).find(t => 
    t.textContent.toLowerCase().includes(tabName)
  );
  const idTabContent = $(`#${tabName}-scanner, #manual-entry`).includes(tabName) ? 
    $(`#${tabName === 'manual' ? 'manual-entry' : tabName + '-scanner'}`) : 
    $(`#${tabName}-scanner`);
  
  if (idTabButton) addClass(idTabButton, 'active');
  if (idTabContent) addClass(idTabContent, 'active');

  // Stop QR scanning when switching away
  if (tabName !== 'qr' && state.qrScanner.isScanning) {
    stopQrScanning();
  }
}

// Camera Functions
async function startCamera() {
  try {
    // Check if camera is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera not supported on this device');
    }

    console.log('Requesting camera access...');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
      }
    });

    console.log('Camera access granted');
    const video = $('#video-element');
    video.srcObject = stream;

    // Wait for video to be ready
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        console.log('Video metadata loaded');
        resolve();
      };
    });

    state.camera.stream = stream;
    state.camera.isActive = true;
    state.camera.detectionStatus = 'idle';

    // Update UI
    addClass($('#camera-preview'), 'active');
    removeClass($('#camera-preview'), 'hidden');
    addClass($('#camera-placeholder'), 'hidden');
    addClass($('#start-camera'), 'hidden');
    removeClass($('#capture-face'), 'hidden');

    toast.success(
      "Camera Ready",
      "Position your face in the camera and click 'Detect' to scan."
    );

  } catch (error) {
    console.error('Error accessing camera:', error);

    let errorMessage = "Could not access camera.";
    let errorTitle = "Camera Error";

    if (error.name === 'NotAllowedError') {
      errorTitle = "Camera Permission Required";
      errorMessage = "Please click 'Allow' when your browser asks for camera permission. If blocked, click the camera icon in your browser's address bar and select 'Always allow'.";
    } else if (error.name === 'NotFoundError') {
      errorMessage = "No camera found on this device. Please connect a camera and try again.";
    } else if (error.name === 'NotReadableError') {
      errorMessage = "Camera is already in use by another application. Please close other apps using the camera.";
    } else if (error.name === 'OverconstrainedError') {
      errorMessage = "Camera settings not supported. Trying with default settings.";
      // Try again with default constraints
      return startCamera();
    }

    // Show error with retry option
    const retryButton = document.createElement('button');
    retryButton.className = 'btn btn-primary';
    retryButton.textContent = '🔄 Try Again';
    retryButton.onclick = () => {
      toast.hide(); // Hide current toast
      startCamera(); // Retry camera access
    };

    toast.error(errorTitle, errorMessage, {
      duration: 8000, // Longer duration for permission errors
      action: retryButton
    });
  }
}

function stopCamera() {
  if (state.camera.stream) {
    state.camera.stream.getTracks().forEach(track => track.stop());
    state.camera.stream = null;
  }
  
  state.camera.isActive = false;
  state.camera.detectionStatus = 'idle';
  
  // Update UI
  removeClass($('#camera-preview'), 'active');
  addClass($('#camera-preview'), 'hidden');
  removeClass($('#camera-placeholder'), 'hidden');
  removeClass($('#start-camera'), 'hidden');
  addClass($('#capture-face'), 'hidden');
}

async function captureAndDetect() {
  const video = $('#video-element');
  const canvas = $('#capture-canvas');
  
  if (!video || !canvas) return;

  state.camera.isProcessing = true;
  state.camera.detectionStatus = 'detecting';

  // Show detection overlay
  removeClass($('#detection-overlay'), 'hidden');
  
  // Update button state
  $('#capture-face').disabled = true;
  $('#capture-face').innerHTML = '<div class="spinner"></div> Processing';

  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    state.camera.capturedImage = imageData;

    // Simulate face detection processing
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mock face detection success (80% success rate for demo)
    const faceDetected = Math.random() > 0.2;

    if (faceDetected) {
      handleFaceDetected(imageData);
    } else {
      handleFaceDetectionFailed();
    }
  } catch (error) {
    console.error('Error during face detection:', error);
    handleFaceDetectionFailed();
  } finally {
    state.camera.isProcessing = false;
    $('#capture-face').disabled = false;
    $('#capture-face').innerHTML = '📷 Detect';
  }
}

async function handleFaceDetected(faceData) {
    state.camera.detectionStatus = 'success';

    // Hide video, show captured image
    addClass($('#camera-preview'), 'hidden');
    removeClass($('#captured-image'), 'hidden');
    $('#face-capture').src = faceData;

    // Show success result
    removeClass($('#face-result'), 'hidden');
    $('#result-icon').textContent = '✅';
    $('#result-icon').style.color = 'var(--success)';
    $('#result-text').textContent = 'Face Detected!';
    $('#result-text').style.color = 'var(--success)';

    // Update controls
    addClass($('#capture-face'), 'hidden');
    removeClass($('#reset-capture'), 'hidden');

    if (state.isRegistering) {
      // For registration, show user details input
      removeClass($('#user-details-input'), 'hidden');
      const confirmBtn = $('#confirm-attendance');
      confirmBtn.textContent = '📝 Register User';
      confirmBtn.onclick = registerUser;
      toast.success(
        "Face Captured!",
        "Please enter your details to complete registration."
      );
    } else {
      // For attendance, try to recognize the face
      try {
        const response = await fetch('/api/face/recognize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ faceData })
        });

        const data = await response.json();

        if (response.ok && data.success && data.user) {
          // Face recognized, show user name and confirm
          $('#result-text').textContent = `Welcome, ${data.user.name}!`;
          $('#user-name').value = data.user.name;
          $('#user-face-id').value = data.user.employeeId;
          removeClass($('#user-details-input'), 'hidden');
          $('#user-name').readOnly = true;
          $('#user-face-id').readOnly = true;

          const confirmBtn = $('#confirm-attendance');
          confirmBtn.textContent = '✅ Confirm Attendance';
          confirmBtn.onclick = () => confirmRecognizedAttendance(data.user);

          toast.success(
            "Face Recognized!",
            `Welcome ${data.user.name}! Please confirm your attendance.`
          );
        } else {
          // Face not recognized, show manual input
          $('#result-text').textContent = 'Face Detected! Please enter your details.';
          removeClass($('#user-details-input'), 'hidden');
          $('#user-name').readOnly = false;
          $('#user-face-id').readOnly = false;

          const confirmBtn = $('#confirm-attendance');
          confirmBtn.textContent = '✅ Confirm Attendance';
          confirmBtn.onclick = confirmAttendance;

          toast.success(
            "Face Detected!",
            "Please enter your details to confirm attendance."
          );
        }
      } catch (error) {
        console.error('Face recognition error:', error);
        // Fallback to manual input
        $('#result-text').textContent = 'Face Detected! Please enter your details.';
        removeClass($('#user-details-input'), 'hidden');
        $('#user-name').readOnly = false;
        $('#user-face-id').readOnly = false;

        const confirmBtn = $('#confirm-attendance');
        confirmBtn.textContent = '✅ Confirm Attendance';
        confirmBtn.onclick = confirmAttendance;

        toast.error(
          "Recognition Failed",
          "Could not recognize face. Please enter your details manually."
        );
      }
    }
  }

function handleFaceDetectionFailed() {
  state.camera.detectionStatus = 'failed';
  
  // Hide detection overlay
  addClass($('#detection-overlay'), 'hidden');
  
  // Show failed result
  removeClass($('#face-result'), 'hidden');
  $('#result-icon').textContent = '❌';
  $('#result-icon').style.color = 'var(--destructive)';
  $('#result-text').textContent = 'Try Again';
  $('#result-text').style.color = 'var(--destructive)';
  
  toast.error(
    "Face Not Detected",
    "Please ensure your face is clearly visible and try again."
  );
  
  // Reset after 2 seconds
  setTimeout(() => {
    addClass($('#face-result'), 'hidden');
    state.camera.detectionStatus = 'idle';
  }, 2000);
}

function resetCapture() {
    state.camera.capturedImage = null;
    state.camera.detectionStatus = 'idle';

    // Reset UI
    addClass($('#captured-image'), 'hidden');
    addClass($('#face-result'), 'hidden');
    removeClass($('#camera-preview'), 'hidden');
    removeClass($('#capture-face'), 'hidden');
    addClass($('#reset-capture'), 'hidden');
    addClass($('#detection-overlay'), 'hidden');
    addClass($('#user-details-input'), 'hidden');

    // Reset input fields
    $('#user-name').value = '';
    $('#user-face-id').value = '';
    $('#user-name').readOnly = false;
    $('#user-face-id').readOnly = false;

    // Reset button to default state
    const confirmBtn = $('#confirm-attendance');
    confirmBtn.textContent = '✅ Confirm Attendance';
    confirmBtn.onclick = confirmAttendance;
  }

function resetCameraState() {
  stopCamera();
  resetCapture();
  
  // Reset all camera UI elements
  removeClass($('#start-camera'), 'hidden');
  addClass($('#capture-face'), 'hidden');
  addClass($('#reset-capture'), 'hidden');
  removeClass($('#camera-placeholder'), 'hidden');
  addClass($('#camera-preview'), 'hidden');
  addClass($('#captured-image'), 'hidden');
}

// QR Scanner Functions
async function startQrScanning() {
  const video = $('#qr-video');

  if (!video) {
    toast.error("Scanner Error", "QR scanner not available.");
    return;
  }

  try {
    // Check if camera is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera not supported on this device');
    }

    console.log('Starting QR scanner...');
    state.qrScanner.isScanning = true;

    // Create QR Scanner instance
    state.qrScanner.scanner = new QrScanner(
      video,
      (result) => {
        console.log('QR Code detected:', result.data);
        toast.success("QR Code Scanned!", `Code: ${result.data}`);
        handleIdScanned({ type: 'qr', data: result.data });
      },
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
        returnDetailedScanResult: true
      }
    );

    await state.qrScanner.scanner.start();
    console.log('QR scanner started successfully');

    // Update UI
    removeClass($('#qr-preview'), 'hidden');
    addClass($('#qr-placeholder'), 'hidden');
    removeClass($('#stop-qr'), 'hidden');
    addClass($('#start-qr'), 'hidden');

    toast.success(
      "QR Scanner Active",
      "Position QR code in the camera view to scan."
    );

  } catch (error) {
    console.error('Error starting QR scanner:', error);

    let errorMessage = "Could not start QR scanner.";
    if (error.name === 'NotAllowedError') {
      errorMessage = "Camera access denied. Please allow camera permissions.";
    } else if (error.name === 'NotFoundError') {
      errorMessage = "No camera found on this device.";
    } else if (error.name === 'NotReadableError') {
      errorMessage = "Camera is already in use by another application.";
    }

    toast.error("Scanner Error", errorMessage);
    state.qrScanner.isScanning = false;
  }
}

function stopQrScanning() {
  if (state.qrScanner.scanner) {
    state.qrScanner.scanner.stop();
    state.qrScanner.scanner.destroy();
    state.qrScanner.scanner = null;
  }
  
  state.qrScanner.isScanning = false;
  
  // Update UI
  addClass($('#qr-preview'), 'hidden');
  removeClass($('#qr-placeholder'), 'hidden');
  addClass($('#stop-qr'), 'hidden');
  removeClass($('#start-qr'), 'hidden');
}

// Card Scanner Functions
async function scanCard() {
  const scanningOverlay = $('#card-scanning');
  
  try {
    removeClass(scanningOverlay, 'hidden');
    
    // Simulate card scanning process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Mock card data
    const mockCardData = `CARD_${Date.now().toString().slice(-6)}`;
    handleIdScanned({ type: 'card', data: mockCardData });
    
  } catch (error) {
    console.error('Error scanning card:', error);
    toast.error(
      "Card Scan Failed",
      "Please try scanning your card again."
    );
  } finally {
    addClass(scanningOverlay, 'hidden');
  }
}

// Manual ID Functions
function submitManualId() {
  const manualIdInput = $('#manual-id');
  const manualId = manualIdInput.value.trim();

  if (!manualId) {
    toast.error(
      "Invalid ID",
      "Please enter a valid ID number."
    );
    return;
  }

  handleIdScanned({ type: 'manual', data: manualId });
  manualIdInput.value = '';
}

// ID Scanning Success Handler
async function handleIdScanned(idData) {
   console.log('ID scanned:', idData);

   try {
     // Mark attendance via API
     const response = await fetch('/api/attendance', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({
         employeeId: idData.data,
         name: 'Unknown', // Will be updated by API if user exists
         method: idData.type,
         status: 'present',
         location: 'Office',
         ipAddress: '127.0.0.1'
       })
     });

     const data = await response.json();

     if (!response.ok) {
       throw new Error(data.message || 'Failed to mark attendance');
     }

     // Hide all ID scanning interfaces
     $$('.id-tab-content').forEach(content => addClass(content, 'hidden'));

     // Show success state
     removeClass($('#id-success'), 'hidden');
     $('#verified-id').textContent = `ID: ${idData.data}`;

     // Set user data
     state.user = {
       name: data.attendance.name,
       id: idData.data
     };

     toast.success(
       `${idData.type.toUpperCase()} Code Scanned!`,
       `Attendance marked for ${data.attendance.name}`
     );

     // Auto switch to dashboard after 1.5 seconds
     setTimeout(() => {
       switchMode('dashboard');
     }, 1500);

   } catch (error) {
     console.error('ID scanning error:', error);
     toast.error(
       "Attendance Failed",
       error.message || "Failed to mark attendance. Please try again."
     );
   }
 }

function resetIdScanner() {
  // Hide success state
  addClass($('#id-success'), 'hidden');
  
  // Show current ID tab content
  const currentTab = state.currentIdTab;
  const tabContent = currentTab === 'manual' ? 
    $('#manual-entry') : 
    $(`#${currentTab}-scanner`);
  
  if (tabContent) {
    removeClass(tabContent, 'hidden');
    addClass(tabContent, 'active');
  }
  
  // Reset manual input
  const manualIdInput = $('#manual-id');
  if (manualIdInput) manualIdInput.value = '';
  
  // Stop any active scanning
  if (state.qrScanner.isScanning) {
    stopQrScanning();
  }
}

// Dashboard Functions
function initializeDashboard() {
   updateCurrentDate();
   loadAttendanceData();
   renderAttendanceRecords();
 }

function updateCurrentDate() {
  const currentDateEl = $('#current-date');
  if (currentDateEl) {
    currentDateEl.textContent = formatDate(new Date());
  }
  
  const lastUpdateEl = $('#last-update');
  if (lastUpdateEl) {
    lastUpdateEl.textContent = formatTime(new Date());
  }
}

async function loadAttendanceData() {
   try {
     const response = await fetch('/api/dashboard');
     const data = await response.json();

     if (response.ok) {
       // Update state with real data
       state.attendanceRecords = data.recentAttendance.map(record => ({
         id: record._id,
         name: record.name,
         employeeId: record.employeeId,
         timestamp: new Date(record.timestamp),
         method: record.method,
         status: record.status
       }));

       // Update dashboard stats
       const stats = data.todayStats;
       $('#total-employees').textContent = data.totalUsers;
       $('#present-count').textContent = stats.present;
       $('#late-count').textContent = stats.late;
       $('#absent-count').textContent = stats.absent;

       // Calculate rates
       const totalMarked = stats.present + stats.late;
       const checkinRate = data.totalUsers > 0 ? Math.round((totalMarked / data.totalUsers) * 100) : 0;
       const ontimeRate = totalMarked > 0 ? Math.round((stats.present / totalMarked) * 100) : 0;

       $('#checkin-rate').textContent = `${checkinRate}%`;
       $('#ontime-rate').textContent = `${ontimeRate}%`;

     } else {
       console.error('Failed to load dashboard data:', data.message);
       // Fallback to mock data if API fails
       loadMockAttendanceData();
     }
   } catch (error) {
     console.error('Error loading attendance data:', error);
     // Fallback to mock data
     loadMockAttendanceData();
   }
 }

function loadMockAttendanceData() {
   // Fallback mock data
   const mockRecords = [
     {
       id: '1',
       name: 'John Smith',
       employeeId: 'EMP001',
       timestamp: new Date(),
       method: 'face',
       status: 'present',
     },
     {
       id: '2',
       name: 'Sarah Johnson',
       employeeId: 'EMP002',
       timestamp: new Date(Date.now() - 300000),
       method: 'qr',
       status: 'present',
     },
     {
       id: '3',
       name: 'Mike Davis',
       employeeId: 'EMP003',
       timestamp: new Date(Date.now() - 600000),
       method: 'card',
       status: 'late',
     },
   ];

   state.attendanceRecords = mockRecords;
 }

function updateDashboardStats() {
  const records = state.attendanceRecords;
  const stats = {
    total: 50, // Total employees
    present: records.filter(r => r.status === 'present').length,
    late: records.filter(r => r.status === 'late').length,
    absent: 50 - records.length, // Remaining employees
  };

  // Update stat values
  $('#total-employees').textContent = stats.total;
  $('#present-count').textContent = stats.present;
  $('#late-count').textContent = stats.late;
  $('#absent-count').textContent = stats.absent;

  // Update rates
  const checkinRate = Math.round(((stats.present + stats.late) / stats.total) * 100);
  const ontimeRate = stats.present + stats.late > 0 ? 
    Math.round((stats.present / (stats.present + stats.late)) * 100) : 0;

  $('#checkin-rate').textContent = `${checkinRate}%`;
  $('#ontime-rate').textContent = `${ontimeRate}%`;
}

function renderAttendanceRecords() {
  const recordsList = $('#attendance-records');
  const noRecords = $('#no-records');
  
  if (state.attendanceRecords.length === 0) {
    removeClass(noRecords, 'hidden');
    addClass(recordsList.parentElement, 'hidden');
    return;
  }

  addClass(noRecords, 'hidden');
  removeClass(recordsList.parentElement, 'hidden');

  recordsList.innerHTML = state.attendanceRecords.map(record => {
    const initials = record.name.split(' ').map(n => n[0]).join('');
    const methodIcon = getMethodIcon(record.method);
    
    return `
      <div class="record-item animate-fade-in">
        <div class="record-left">
          <div class="record-avatar">${initials}</div>
          <div class="record-info">
            <h4>${record.name}</h4>
            <p>ID: ${record.employeeId}</p>
          </div>
        </div>
        <div class="record-right">
          <div class="record-method">
            <span class="record-method-icon">${methodIcon}</span>
            <p class="record-method-text">${record.method}</p>
          </div>
          <div class="record-details">
            <p class="record-time">${formatTime(record.timestamp)}</p>
            <span class="record-status ${record.status}">${record.status}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function getMethodIcon(method) {
   const icons = {
     'face': '👤',
     'qr': '📱',
     'card': '💳',
     'manual': '✍️'
   };
   return icons[method] || '❓';
 }

// My Attendance Functions
function initializeMyAttendance() {
   // Show recent employees if any
   if (state.attendanceRecords.length > 0) {
     removeClass($('#recent-employees'), 'hidden');
     populateRecentEmployees();
   }
 }

function populateRecentEmployees() {
   const recentList = $('#recent-list');
   const uniqueEmployees = [...new Set(state.attendanceRecords.map(r => r.employeeId))];

   recentList.innerHTML = uniqueEmployees.slice(0, 5).map(id => {
     const record = state.attendanceRecords.find(r => r.employeeId === id);
     return `
       <button class="recent-employee-btn" onclick="selectEmployee('${id}')">
         ${record.name} (${id})
       </button>
     `;
   }).join('');
 }

function selectEmployee(employeeId) {
   $('#employee-id-input').value = employeeId;
   loadEmployeeAttendance();
 }

async function loadEmployeeAttendance() {
   const employeeId = $('#employee-id-input').value.trim();

   if (!employeeId) {
     toast.error("Invalid ID", "Please enter an employee ID.");
     return;
   }

   try {
     // Fetch employee data
     const userResponse = await fetch(`/api/users/${employeeId}`);
     const userData = await userResponse.json();

     if (!userResponse.ok) {
       throw new Error(userData.message || 'Employee not found');
     }

     const employeeName = userData.name;
     $('#employee-name-display').textContent = `Employee: ${employeeName}`;

     // Fetch attendance records for this employee (last 1 month)
     const oneMonthAgo = new Date();
     oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
     const startDate = oneMonthAgo.toISOString().split('T')[0]; // YYYY-MM-DD format

     const attendanceResponse = await fetch(`/api/attendance?employeeId=${employeeId}&startDate=${startDate}&limit=50`);
     const attendanceData = await attendanceResponse.json();

     if (!attendanceResponse.ok) {
       throw new Error('Failed to load attendance records');
     }

     // Update UI - show records directly
     displayEmployeeRecords(attendanceData);

     removeClass($('#attendance-summary'), 'hidden');

     toast.success("Attendance Loaded", `Showing attendance for ${employeeName}`);

   } catch (error) {
     console.error('Error loading employee attendance:', error);
     toast.error("Load Failed", error.message || "Failed to load attendance data");
   }
 }

function generateHistoricalAttendance(employeeId) {
   const records = [];
   const now = new Date();
   const employeeRecord = state.attendanceRecords.find(r => r.employeeId === employeeId);
   const employeeName = employeeRecord ? employeeRecord.name : `Employee ${employeeId}`;

   // Generate records for the past 90 days
   for (let i = 0; i < 90; i++) {
     const date = new Date(now);
     date.setDate(date.getDate() - i);

     // Skip weekends for demo (optional)
     if (date.getDay() === 0 || date.getDay() === 6) continue;

     // Random attendance (80% present rate)
     if (Math.random() > 0.2) {
       const checkInTime = new Date(date);
       checkInTime.setHours(8 + Math.random() * 2, Math.random() * 60); // 8-10 AM

       const status = checkInTime.getHours() >= 9 ? 'late' : 'present';
       const method = ['face', 'qr', 'card'][Math.floor(Math.random() * 3)];

       records.push({
         id: `hist_${employeeId}_${i}`,
         name: employeeName,
         employeeId: employeeId,
         timestamp: checkInTime,
         method: method,
         status: status
       });
     }
   }

   return records.sort((a, b) => b.timestamp - a.timestamp);
 }


function displayEmployeeRecords(records) {
    const recordsList = $('#employee-records');
    const noRecords = $('#no-employee-records');

    if (records.length === 0) {
      removeClass(noRecords, 'hidden');
      addClass(recordsList.parentElement, 'hidden');
      return;
    }

    addClass(noRecords, 'hidden');
    removeClass(recordsList.parentElement, 'hidden');

    recordsList.innerHTML = records.map(record => {
      const initials = record.name.split(' ').map(n => n[0]).join('');
      const methodIcon = getMethodIcon(record.method);
      const recordDate = new Date(record.timestamp);

      return `
        <div class="record-item animate-fade-in">
          <div class="record-left">
            <div class="record-avatar">${initials}</div>
            <div class="record-info">
              <h4>${record.name}</h4>
              <p>ID: ${record.employeeId}</p>
            </div>
          </div>
          <div class="record-right">
            <div class="record-method">
              <span class="record-method-icon">${methodIcon}</span>
              <p class="record-method-text">${record.method}</p>
            </div>
            <div class="record-details">
              <p class="record-time">${formatTime(recordDate)}</p>
              <p class="record-date">${formatDate(recordDate)}</p>
              <span class="record-status ${record.status}">${record.status}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

// Generate QR Functions
async function initializeGenerateQR() {
  await loadUsersForQR();
}

async function loadUsersForQR() {
  try {
    const response = await fetch('/api/users');
    const users = await response.json();

    if (response.ok && users.length > 0) {
      displayUserList(users);
    } else {
      addClass($('#user-list'), 'hidden');
      removeClass($('#no-users'), 'hidden');
    }
  } catch (error) {
    console.error('Error loading users:', error);
    toast.error("Load Failed", "Failed to load user list");
  }
}

function displayUserList(users) {
  const userList = $('#user-list');
  removeClass(userList, 'hidden');
  addClass($('#no-users'), 'hidden');

  userList.innerHTML = users.map(user => {
    const initials = user.name.split(' ').map(n => n[0]).join('');
    return `
      <div class="user-item" onclick="generateUserQR('${user.employeeId}', '${user.name}')">
        <div class="user-avatar">${initials}</div>
        <div class="user-info">
          <h4>${user.name}</h4>
          <p>ID: ${user.employeeId}</p>
        </div>
        <div class="user-action">
          <button class="btn btn-primary btn-sm">📱 Generate QR</button>
        </div>
      </div>
    `;
  }).join('');
}

async function generateUserQR(employeeId, name) {
  try {
    if (typeof QRCode === 'undefined') {
      throw new Error('QRCode library not loaded');
    }

    const canvas = $('#user-qr-canvas');
    if (!canvas) {
      throw new Error('Canvas element not found');
    }

    // Set canvas size
    canvas.width = 200;
    canvas.height = 200;

    // Clear previous QR
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Generate QR code for employee ID using promise wrapper
    await new Promise((resolve, reject) => {
      QRCode.toCanvas(canvas, employeeId, {
        width: 200,
        height: 200,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      }, function (error) {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    // Set image src to canvas data
    const qrImage = $('#user-qr-image');
    qrImage.src = canvas.toDataURL('image/png');

    // Update display
    $('#qr-user-name').textContent = `QR Code for ${name}`;
    $('#qr-employee-id').textContent = employeeId;
    $('#qr-name').textContent = name;

    removeClass($('#qr-display-section'), 'hidden');

    toast.success("QR Code Generated", `QR code created for ${name}`);

  } catch (error) {
    console.error('QR generation error:', error);
    toast.error("Generation Failed", `Could not generate QR code: ${error.message}`);
  }
}

function downloadQR() {
  const qrImage = $('#user-qr-image');
  const link = document.createElement('a');
  link.download = `qr-${$('#qr-employee-id').textContent}.png`;
  link.href = qrImage.src;
  link.click();

  toast.success("Download Started", "QR code image downloaded");
}

// Test QR Code Generator
function generateTestQR() {
  const input = $('#test-qr-input');
  const display = $('#test-qr-display');
  const canvas = $('#test-qr-canvas');

  const qrText = input.value.trim();

  if (!qrText) {
    toast.error("Input Required", "Please enter an employee ID to generate QR code.");
    return;
  }

  try {
    // Clear previous QR code
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Generate new QR code
    QRCode.toCanvas(canvas, qrText, {
      width: 150,
      height: 150,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    }, function (error) {
      if (error) {
        console.error('QR Code generation error:', error);
        toast.error("QR Generation Failed", "Could not generate QR code.");
      } else {
        console.log('QR Code generated successfully');
        removeClass(display, 'hidden');
        toast.success("QR Code Generated", `Test QR code for: ${qrText}`);
      }
    });

  } catch (error) {
    console.error('QR Code generation error:', error);
    toast.error("QR Generation Failed", "Could not generate QR code.");
  }
}

// User Registration
async function registerUser() {
  const nameInput = $('#user-name');
  const faceIdInput = $('#user-face-id');

  const name = nameInput.value.trim();
  const employeeId = faceIdInput.value.trim();

  if (!name || !employeeId) {
    toast.error(
      "Missing Information",
      "Please enter both your name and employee ID."
    );
    return;
  }

  // Get the captured face data
  const faceData = state.camera.capturedImage;

  if (!faceData) {
    toast.error(
      "Face Data Missing",
      "Please recapture your face before registering."
    );
    return;
  }

  try {
    // Register user via API
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name,
        employeeId: employeeId,
        email: `${employeeId.toLowerCase()}@company.com`, // Generate email
        faceData: faceData
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to register user');
    }

    // Set user
    state.user = { name: name, id: employeeId };

    // Clear inputs and hide details
    nameInput.value = '';
    faceIdInput.value = '';
    addClass($('#user-details-input'), 'hidden');

    toast.success(
      "Registration Successful!",
      `Welcome ${name}! Your account has been created.`
    );

    // Switch to dashboard
    switchMode('dashboard');

  } catch (error) {
    console.error('Registration error:', error);
    toast.error(
      "Registration Failed",
      error.message || "Failed to create account. Please try again."
    );
  }
}

// Attendance Confirmation
async function confirmAttendance() {
  const nameInput = $('#user-name');
  const faceIdInput = $('#user-face-id');

  const name = nameInput.value.trim();
  const faceId = faceIdInput.value.trim();

  if (!name || !faceId) {
    toast.error(
      "Missing Information",
      "Please enter both your name and face ID."
    );
    return;
  }

  try {
    // Mark attendance via API
    const response = await fetch('/api/attendance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        employeeId: faceId,
        name: name,
        method: 'face',
        status: 'present', // API will determine based on time
        location: 'Office',
        ipAddress: '127.0.0.1' // In production, get real IP
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to mark attendance');
    }

    // Set user
    state.user = { name: name, id: faceId };

    // Clear inputs and hide details
    nameInput.value = '';
    faceIdInput.value = '';
    addClass($('#user-details-input'), 'hidden');

    toast.success(
      "Attendance Confirmed!",
      `Welcome ${name}! Attendance marked successfully.`
    );

    // Switch to dashboard
    switchMode('dashboard');

  } catch (error) {
    console.error('Attendance error:', error);
    toast.error(
      "Attendance Failed",
      error.message || "Failed to mark attendance. Please try again."
    );
  }
}

// Recognized Attendance Confirmation
async function confirmRecognizedAttendance(user) {
  try {
    // Mark attendance via API
    const response = await fetch('/api/attendance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        employeeId: user.employeeId,
        name: user.name,
        method: 'face',
        status: 'present', // API will determine based on time
        location: 'Office',
        ipAddress: '127.0.0.1' // In production, get real IP
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to mark attendance');
    }

    // Set user
    state.user = { name: user.name, id: user.employeeId };

    // Clear inputs and hide details
    $('#user-name').value = '';
    $('#user-face-id').value = '';
    addClass($('#user-details-input'), 'hidden');

    toast.success(
      "Attendance Confirmed!",
      `Welcome ${user.name}! Attendance marked successfully.`
    );

    // Switch to dashboard
    switchMode('dashboard');

  } catch (error) {
    console.error('Attendance error:', error);
    toast.error(
      "Attendance Failed",
      error.message || "Failed to mark attendance. Please try again."
    );
  }
}

// Reset Functions
function resetAllStates() {
  state.user = null;
  state.currentTab = 'face';
  state.currentIdTab = 'qr';
  resetCameraState();
  resetIdScanner();
  stopQrScanning();
}

// Event Listeners for Manual ID Input
function setupManualIdInput() {
  const manualIdInput = $('#manual-id');
  if (manualIdInput) {
    manualIdInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        submitManualId();
      }
    });
    
    manualIdInput.addEventListener('input', (e) => {
      const submitBtn = manualIdInput.nextElementSibling;
      if (submitBtn && submitBtn.classList.contains('btn')) {
        submitBtn.disabled = !e.target.value.trim();
      }
    });
  }
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  console.log('SmartAttend initialized');
  
  // Set initial screen
  switchMode('home');
  
  // Setup manual ID input listeners
  setupManualIdInput();
  
  // Initialize current date in dashboard
  updateCurrentDate();
  
  // Update time every minute
  setInterval(updateCurrentDate, 60000);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (state.camera.stream) {
    state.camera.stream.getTracks().forEach(track => track.stop());
  }
  if (state.qrScanner.scanner) {
    state.qrScanner.scanner.destroy();
  }
});

// Global functions for HTML onclick handlers
window.switchMode = switchMode;
window.switchTab = switchTab;
window.switchIdTab = switchIdTab;
window.startCamera = startCamera;
window.captureAndDetect = captureAndDetect;
window.resetCapture = resetCapture;
window.startQrScanning = startQrScanning;
window.stopQrScanning = stopQrScanning;
window.scanCard = scanCard;
window.submitManualId = submitManualId;
window.resetIdScanner = resetIdScanner;
window.registerUser = registerUser;
window.confirmAttendance = confirmAttendance;
window.confirmRecognizedAttendance = confirmRecognizedAttendance;
window.loadEmployeeAttendance = loadEmployeeAttendance;
window.selectEmployee = selectEmployee;
window.generateTestQR = generateTestQR;
window.generateUserQR = generateUserQR;
window.downloadQR = downloadQR;