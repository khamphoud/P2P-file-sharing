// P2P File Transfer Application
class P2PFileTransfer {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.roomCode = null;
        this.isInitiator = false;
        this.filesToSend = [];
        this.currentFileIndex = 0;
        this.chunkSize = 16384; // 16KB chunks
        this.currentReceivingFile = null;
        this.isCleaningUp = false;
        this.roomExpiryTimer = null;
        this.transferStartTime = null;
        
        // Firebase listeners references
        this.offerListener = null;
        this.answerListener = null;
        this.candidateListener = null;
        
        // Performance tracking
        this.transferStats = {
            startTime: null,
            bytesTransferred: 0,
            filesTransferred: 0
        };
        
        this.init();
    }

    init() {
        console.log('Initializing P2P File Transfer App');
        
        // Check WebRTC support
        if (!this.checkWebRTCSupport()) {
            return;
        }
        
        // Initialize DOM elements
        this.initDomElements();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup drag and drop
        this.setupDragAndDrop();
        
        // Setup online/offline detection
        this.setupConnectionMonitoring();
        
        // Add debug button
        this.addDebugButton();
        
        this.log('App initialized successfully');
    }

    initDomElements() {
        // DOM Elements
        this.createRoomBtn = document.getElementById('createRoom');
        this.joinRoomBtn = document.getElementById('joinRoom');
        this.roomCodeInput = document.getElementById('roomCode');
        this.roomCodeDisplay = document.getElementById('roomCodeDisplay');
        this.roomTimer = document.getElementById('roomTimer');
        this.timerValue = document.getElementById('timerValue');
        this.transferSection = document.getElementById('transferSection');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.retrySection = document.getElementById('retrySection');
        this.retryBtn = document.getElementById('retryConnection');
        this.fileInput = document.getElementById('fileInput');
        this.selectFilesBtn = document.getElementById('selectFiles');
        this.dropArea = document.getElementById('dropArea');
        this.sendFilesBtn = document.getElementById('sendFiles');
        this.clearFilesBtn = document.getElementById('clearFiles');
        this.fileList = document.getElementById('fileList');
        this.progressSection = document.getElementById('progressSection');
        this.progressBar = document.getElementById('progressBar');
        this.progressText = document.getElementById('progressText');
        this.speedText = document.getElementById('speedText');
        this.timeRemaining = document.getElementById('timeRemaining');
        this.currentFileInfo = document.getElementById('currentFileInfo');
        this.receivedSection = document.getElementById('receivedSection');
        this.receivedFiles = document.getElementById('receivedFiles');
        this.onlineStatus = document.getElementById('onlineStatus');
        this.peerCount = document.getElementById('peerCount');
        this.debugModal = document.getElementById('debugModal');
        this.debugLog = document.getElementById('debugLog');
        this.closeDebug = document.getElementById('closeDebug');
    }

    setupEventListeners() {
        this.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.selectFilesBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
        this.sendFilesBtn.addEventListener('click', () => this.sendFiles());
        this.clearFilesBtn.addEventListener('click', () => this.clearFiles());
        this.retryBtn.addEventListener('click', () => this.retryConnection());
        this.closeDebug.addEventListener('click', () => this.debugModal.style.display = 'none');
    }

    checkWebRTCSupport() {
        if (!navigator.mediaDevices || !window.RTCPeerConnection) {
            this.showError('WebRTC is not supported in this browser. Please use Chrome, Firefox, or Edge.');
            return false;
        }
        return true;
    }

    setupConnectionMonitoring() {
        window.addEventListener('online', () => {
            this.onlineStatus.className = 'online';
            this.onlineStatus.innerHTML = '<i class="fas fa-circle"></i> Online';
            this.log('Network connection restored');
        });

        window.addEventListener('offline', () => {
            this.onlineStatus.className = 'offline';
            this.onlineStatus.innerHTML = '<i class="fas fa-circle"></i> Offline';
            this.log('Network connection lost');
        });

        // Initial check
        if (!navigator.onLine) {
            this.onlineStatus.className = 'offline';
            this.onlineStatus.innerHTML = '<i class="fas fa-circle"></i> Offline';
        }
    }

    addDebugButton() {
        const debugBtn = document.createElement('button');
        debugBtn.className = 'btn-secondary';
        debugBtn.innerHTML = '<i class="fas fa-bug"></i> Debug';
        debugBtn.style.position = 'absolute';
        debugBtn.style.top = '20px';
        debugBtn.style.right = '20px';
        debugBtn.onclick = () => this.debugModal.style.display = 'flex';
        document.querySelector('.container').appendChild(debugBtn);
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-${type}`;
        logEntry.innerHTML = `[${timestamp}] ${message}`;
        this.debugLog.appendChild(logEntry);
        this.debugLog.scrollTop = this.debugLog.scrollHeight;
        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    showError(message) {
        this.log(message, 'error');
        alert(message);
    }

    setupDragAndDrop() {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.dropArea.addEventListener(eventName, this.preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            this.dropArea.addEventListener(eventName, () => {
                this.dropArea.classList.add('drag-over');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.dropArea.addEventListener(eventName, () => {
                this.dropArea.classList.remove('drag-over');
            }, false);
        });

        this.dropArea.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            this.handleFiles(files);
        }, false);
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    generateRoomCode() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    }

    startRoomTimer() {
        let timeLeft = 300; // 5 minutes in seconds
        this.roomTimer.style.display = 'block';
        
        this.roomExpiryTimer = setInterval(() => {
            timeLeft--;
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            this.timerValue.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            if (timeLeft <= 0) {
                this.clearRoomTimer();
                if (this.roomCode) {
                    this.showError('Room expired. Please create a new room.');
                    this.cleanup();
                }
            }
        }, 1000);
    }

    clearRoomTimer() {
        if (this.roomExpiryTimer) {
            clearInterval(this.roomExpiryTimer);
            this.roomExpiryTimer = null;
        }
        this.roomTimer.style.display = 'none';
    }

    async createRoom() {
        try {
            this.log('Creating new room...');
            
            this.roomCode = this.generateRoomCode();
            this.isInitiator = true;
            
            this.roomCodeDisplay.textContent = this.roomCode;
            this.updateConnectionStatus('Waiting for peer to join...', 'connecting');
            
            this.transferSection.style.display = 'block';
            this.startRoomTimer();
            
            // Initialize WebRTC
            await this.initWebRTC();
            
            this.log(`Room created with code: ${this.roomCode}`);
            
        } catch (error) {
            this.log(`Error creating room: ${error.message}`, 'error');
            this.showError('Failed to create room. Please try again.');
        }
    }

    async joinRoom() {
        try {
            const code = this.roomCodeInput.value.trim();
            if (!code || code.length !== 4 || !/^\d{4}$/.test(code)) {
                this.showError('Please enter a valid 4-digit code');
                return;
            }
            
            this.log(`Attempting to join room: ${code}`);
            
            this.roomCode = code;
            this.isInitiator = false;
            this.roomCodeDisplay.textContent = this.roomCode;
            this.updateConnectionStatus('Connecting to peer...', 'connecting');
            
            this.transferSection.style.display = 'block';
            this.startRoomTimer();
            
            await this.initWebRTC();
            this.listenForOffer();
            
            this.log(`Joined room: ${code}`);
            
        } catch (error) {
            this.log(`Error joining room: ${error.message}`, 'error');
            this.showError('Failed to join room. Please check the code and try again.');
        }
    }

    updateConnectionStatus(message, status = 'disconnected') {
        this.connectionStatus.textContent = message;
        this.connectionStatus.className = status;
        
        if (status === 'connected') {
            this.connectionStatus.innerHTML = `<i class="fas fa-link"></i> ${message}`;
            this.peerCount.textContent = '1 peer connected';
        } else if (status === 'connecting') {
            this.connectionStatus.innerHTML = `<i class="fas fa-sync fa-spin"></i> ${message}`;
            this.peerCount.textContent = 'Connecting...';
        } else {
            this.connectionStatus.innerHTML = `<i class="fas fa-unlink"></i> ${message}`;
            this.peerCount.textContent = 'No peers connected';
        }
    }

    async initWebRTC() {
        try {
            this.log('Initializing WebRTC connection...');
            
            const configuration = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' }
                ],
                iceCandidatePoolSize: 10
            };

            this.peerConnection = new RTCPeerConnection(configuration);
            
            // Set up data channel
            if (this.isInitiator) {
                this.dataChannel = this.peerConnection.createDataChannel('fileTransfer', {
                    ordered: true,
                    maxRetransmits: 3
                });
                this.setupDataChannel();
            } else {
                this.peerConnection.ondatachannel = (event) => {
                    this.dataChannel = event.channel;
                    this.setupDataChannel();
                };
            }

            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    database.ref(`connections/${this.roomCode}/candidate`).push({
                        candidate: event.candidate,
                        sender: this.isInitiator ? 'offerer' : 'answerer',
                        timestamp: Date.now()
                    });
                }
            };

            // Connection state changes
            this.peerConnection.onconnectionstatechange = () => {
                const state = this.peerConnection.connectionState;
                this.log(`Connection state: ${state}`);
                
                switch(state) {
                    case 'connected':
                        this.updateConnectionStatus('Connected to peer', 'connected');
                        this.sendFilesBtn.disabled = false;
                        this.retrySection.style.display = 'none';
                        break;
                    case 'disconnected':
                    case 'failed':
                        this.updateConnectionStatus('Connection lost', 'disconnected');
                        this.sendFilesBtn.disabled = true;
                        this.retrySection.style.display = 'block';
                        break;
                    case 'closed':
                        this.updateConnectionStatus('Connection closed', 'disconnected');
                        this.sendFilesBtn.disabled = true;
                        break;
                }
            };

            // If initiator, create and send offer
            if (this.isInitiator) {
                const offer = await this.peerConnection.createOffer({
                    offerToReceiveAudio: false,
                    offerToReceiveVideo: false
                });
                
                await this.peerConnection.setLocalDescription(offer);
                
                // Store offer in Firebase with timestamp
                database.ref(`connections/${this.roomCode}/offer`).set({
                    ...offer,
                    timestamp: Date.now()
                });
                
                this.listenForAnswer();
            }

            this.log('WebRTC initialized successfully');
            
        } catch (error) {
            this.log(`Error initializing WebRTC: ${error.message}`, 'error');
            throw error;
        }
    }

    setupDataChannel() {
        this.dataChannel.onopen = () => {
            this.log('Data channel opened');
            this.updateConnectionStatus('Ready to transfer files', 'connected');
            this.sendFilesBtn.disabled = false;
        };

        this.dataChannel.onclose = () => {
            this.log('Data channel closed');
            this.updateConnectionStatus('Connection closed', 'disconnected');
        };

        this.dataChannel.onerror = (error) => {
            this.log(`Data channel error: ${error}`, 'error');
        };

        this.dataChannel.onmessage = (event) => {
            this.handleIncomingData(event.data);
        };
    }

    listenForOffer() {
        this.offerListener = database.ref(`connections/${this.roomCode}/offer`).on('value', async (snapshot) => {
            const offerData = snapshot.val();
            if (offerData && !this.peerConnection.currentRemoteDescription) {
                try {
                    const { sdp, type, timestamp } = offerData;
                    const offer = { sdp, type };
                    
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                    
                    const answer = await this.peerConnection.createAnswer();
                    await this.peerConnection.setLocalDescription(answer);
                    
                    database.ref(`connections/${this.roomCode}/answer`).set({
                        ...answer,
                        timestamp: Date.now()
                    });
                    
                    this.listenForIceCandidates();
                    
                } catch (error) {
                    this.log(`Error handling offer: ${error.message}`, 'error');
                }
            }
        });
    }

    listenForAnswer() {
        this.answerListener = database.ref(`connections/${this.roomCode}/answer`).on('value', async (snapshot) => {
            const answerData = snapshot.val();
            if (answerData && this.peerConnection.signalingState === 'have-local-offer') {
                try {
                    const { sdp, type } = answerData;
                    const answer = { sdp, type };
                    
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                    this.listenForIceCandidates();
                    
                } catch (error) {
                    this.log(`Error handling answer: ${error.message}`, 'error');
                }
            }
        });
    }

    listenForIceCandidates() {
        this.candidateListener = database.ref(`connections/${this.roomCode}/candidate`).on('child_added', async (snapshot) => {
            const data = snapshot.val();
            if (data && this.peerConnection.remoteDescription) {
                try {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    // Ignore duplicate candidates
                    if (e.toString().indexOf('Error processing ICE candidate') === -1) {
                        this.log(`Error adding ICE candidate: ${e}`, 'error');
                    }
                }
            }
        });
    }

    handleFiles(files) {
        if (!files || files.length === 0) return;
        
        // Limit to 10 files
        const fileArray = Array.from(files).slice(0, 10);
        
        // Check file sizes (max 1GB each)
        const oversizedFiles = fileArray.filter(file => file.size > 1073741824); // 1GB in bytes
        if (oversizedFiles.length > 0) {
            this.showError('Some files exceed 1GB limit and were not added.');
            // Remove oversized files
            fileArray = fileArray.filter(file => file.size <= 1073741824);
        }
        
        this.filesToSend.push(...fileArray);
        this.updateFileList();
    }

    updateFileList() {
        this.fileList.innerHTML = '';
        
        if (this.filesToSend.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-message';
            emptyMsg.textContent = 'No files selected';
            this.fileList.appendChild(emptyMsg);
            return;
        }
        
        let totalSize = 0;
        
        this.filesToSend.forEach((file, index) => {
            totalSize += file.size;
            
            const div = document.createElement('div');
            div.className = 'file-item';
            div.innerHTML = `
                <div class="file-info">
                    <i class="fas fa-file"></i>
                    <div>
                        <div class="file-name">${file.name}</div>
                        <div class="file-size">${this.formatFileSize(file.size)}</div>
                    </div>
                </div>
                <button class="remove-file" onclick="p2pApp.removeFile(${index})">
                    <i class="fas fa-times"></i>
                </button>
            `;
            this.fileList.appendChild(div);
        });
        
        // Show total
        const totalDiv = document.createElement('div');
        totalDiv.className = 'file-total';
        totalDiv.innerHTML = `
            <strong>Total:</strong> ${this.filesToSend.length} files, ${this.formatFileSize(totalSize)}
        `;
        this.fileList.appendChild(totalDiv);
    }

    removeFile(index) {
        this.filesToSend.splice(index, 1);
        this.updateFileList();
    }

    clearFiles() {
        this.filesToSend = [];
        this.updateFileList();
        this.progressSection.style.display = 'none';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async sendFiles() {
        if (!this.filesToSend.length || !this.dataChannel || this.dataChannel.readyState !== 'open') {
            this.showError('Please select files and ensure connection is established');
            return;
        }

        this.progressSection.style.display = 'block';
        this.receivedSection.style.display = 'block';
        this.currentFileIndex = 0;
        this.transferStats.startTime = Date.now();
        this.transferStats.bytesTransferred = 0;
        this.transferStats.filesTransferred = 0;
        
        // Disable send button during transfer
        this.sendFilesBtn.disabled = true;
        this.sendFilesBtn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Sending...';
        
        try {
            for (let i = 0; i < this.filesToSend.length; i++) {
                this.currentFileIndex = i;
                await this.sendFile(this.filesToSend[i]);
                this.transferStats.filesTransferred++;
            }
            
            // Send completion message
            this.dataChannel.send(JSON.stringify({
                type: 'transfer_complete',
                totalFiles: this.filesToSend.length,
                totalSize: this.transferStats.bytesTransferred
            }));
            
            this.log(`Transfer completed: ${this.filesToSend.length} files sent`);
            
        } catch (error) {
            this.log(`Error during transfer: ${error.message}`, 'error');
            this.showError('Transfer failed. Please try again.');
        } finally {
            this.sendFilesBtn.disabled = false;
            this.sendFilesBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Files';
        }
    }

    async sendFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            const fileSize = file.size;
            let offset = 0;
            let chunkCount = 0;
            const totalChunks = Math.ceil(fileSize / this.chunkSize);
            
            // Send file metadata first
            const metadata = {
                type: 'file_start',
                name: file.name,
                size: file.size,
                type: file.type || 'application/octet-stream',
                totalFiles: this.filesToSend.length,
                currentFile: this.currentFileIndex + 1,
                totalChunks: totalChunks
            };
            
            this.dataChannel.send(JSON.stringify(metadata));
            
            this.currentFileInfo.textContent = `Sending: ${file.name} (0/${totalChunks} chunks)`;
            
            reader.onload = (e) => {
                const buffer = e.target.result;
                const bytes = new Uint8Array(buffer);
                
                const sendNextChunk = () => {
                    if (this.dataChannel.readyState !== 'open') {
                        reject(new Error('Data channel closed'));
                        return;
                    }
                    
                    if (offset >= fileSize) {
                        // File complete
                        this.dataChannel.send(JSON.stringify({
                            type: 'file_end',
                            name: file.name
                        }));
                        
                        this.log(`File sent: ${file.name}`);
                        resolve();
                        return;
                    }
                    
                    const chunk = bytes.slice(offset, offset + this.chunkSize);
                    try {
                        this.dataChannel.send(chunk);
                        chunkCount++;
                        this.transferStats.bytesTransferred += chunk.length;
                        offset += this.chunkSize;
                        
                        // Update progress
                        const fileProgress = Math.min(100, Math.round((offset / fileSize) * 100));
                        const totalProgress = Math.round(
                            (this.currentFileIndex / this.filesToSend.length) * 100 + 
                            (fileProgress / this.filesToSend.length)
                        );
                        
                        this.updateProgress(totalProgress, file.name, fileProgress, chunkCount, totalChunks);
                        
                        // Calculate transfer speed
                        const elapsed = (Date.now() - this.transferStats.startTime) / 1000; // seconds
                        const speed = this.transferStats.bytesTransferred / elapsed; // bytes per second
                        
                        // Update speed display
                        if (speed > 0) {
                            this.speedText.textContent = `Speed: ${this.formatFileSize(speed)}/s`;
                            
                            // Estimate remaining time
                            const remainingBytes = this.getRemainingBytes();
                            const remainingTime = remainingBytes / speed;
                            if (remainingTime < 60) {
                                this.timeRemaining.textContent = `Time left: ${Math.round(remainingTime)}s`;
                            } else {
                                this.timeRemaining.textContent = `Time left: ${Math.round(remainingTime / 60)}min`;
                            }
                        }
                        
                        // Schedule next chunk (small delay to prevent overwhelming)
                        setTimeout(sendNextChunk, 0);
                        
                    } catch (error) {
                        reject(error);
                    }
                };
                
                sendNextChunk();
            };
            
            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };
            
            reader.readAsArrayBuffer(file);
        });
    }

    getRemainingBytes() {
        let remaining = 0;
        for (let i = this.currentFileIndex; i < this.filesToSend.length; i++) {
            remaining += this.filesToSend[i].size;
        }
        return remaining;
    }

    updateProgress(totalProgress, fileName, fileProgress, currentChunk, totalChunks) {
        this.progressBar.style.width = `${totalProgress}%`;
        this.progressText.textContent = `${totalProgress}%`;
        this.currentFileInfo.textContent = 
            `Sending: ${fileName} - ${fileProgress}% (${currentChunk}/${totalChunks} chunks)`;
    }

    handleIncomingData(data) {
        try {
            // Try to parse as JSON (metadata)
            if (typeof data === 'string') {
                const message = JSON.parse(data);
                this.handleMetadata(message);
            } else {
                // Handle binary data (file chunks)
                this.handleFileChunk(data);
            }
        } catch (e) {
            // It's binary data
            this.handleFileChunk(data);
        }
    }

    handleMetadata(message) {
        switch (message.type) {
            case 'file_start':
                this.currentReceivingFile = {
                    name: message.name,
                    size: message.size,
                    type: message.type,
                    data: [],
                    received: 0,
                    totalChunks: message.totalChunks || 0,
                    receivedChunks: 0,
                    totalFiles: message.totalFiles || 1,
                    currentFile: message.currentFile || 1
                };
                
                this.receivedSection.style.display = 'block';
                this.receivedFiles.innerHTML += `
                    <div class="receiving-file">
                        <i class="fas fa-download"></i>
                        <span>Receiving: ${message.name} (${this.formatFileSize(message.size)})</span>
                        <div class="file-progress"></div>
                    </div>
                `;
                
                this.log(`Starting to receive: ${message.name}`);
                break;
                
            case 'file_end':
                if (this.currentReceivingFile) {
                    // Combine chunks and create download link
                    const blob = new Blob(this.currentReceivingFile.data, 
                        { type: this.currentReceivingFile.type });
                    const url = URL.createObjectURL(blob);
                    
                    const downloadDiv = document.createElement('div');
                    downloadDiv.className = 'download-item';
                    downloadDiv.innerHTML = `
                        <i class="fas fa-file"></i>
                        <span>${this.currentReceivingFile.name} (${this.formatFileSize(this.currentReceivingFile.size)})</span>
                        <a href="${url}" download="${this.currentReceivingFile.name}" class="btn-secondary">
                            <i class="fas fa-download"></i> Download
                        </a>
                    `;
                    
                    // Replace the receiving indicator with download link
                    const receivingElements = this.receivedFiles.querySelectorAll('.receiving-file');
                    if (receivingElements.length > 0) {
                        receivingElements[receivingElements.length - 1].replaceWith(downloadDiv);
                    } else {
                        this.receivedFiles.appendChild(downloadDiv);
                    }
                    
                    this.log(`Received: ${this.currentReceivingFile.name}`);
                    this.currentReceivingFile = null;
                }
                break;
                
            case 'transfer_complete':
                this.log(`Transfer completed. Total: ${message.totalFiles} files, ${this.formatFileSize(message.totalSize)}`);
                this.showSuccess('File transfer completed successfully!');
                this.progressSection.style.display = 'none';
                break;
        }
    }

    handleFileChunk(chunk) {
        if (this.currentReceivingFile) {
            this.currentReceivingFile.data.push(chunk);
            this.currentReceivingFile.received += chunk.byteLength;
            this.currentReceivingFile.receivedChunks++;
            
            const progress = Math.round(
                (this.currentReceivingFile.received / this.currentReceivingFile.size) * 100
            );
            
            // Update progress bar
            this.progressBar.style.width = `${progress}%`;
            this.progressText.textContent = `${progress}%`;
            
            // Update receiving file progress
            const receivingElements = this.receivedFiles.querySelectorAll('.receiving-file');
            if (receivingElements.length > 0) {
                const lastElement = receivingElements[receivingElements.length - 1];
                const progressBar = lastElement.querySelector('.file-progress');
                if (progressBar) {
                    progressBar.style.width = `${progress}%`;
                }
                
                // Update text
                const textSpan = lastElement.querySelector('span');
                if (textSpan) {
                    const chunkInfo = this.currentReceivingFile.totalChunks > 0 
                        ? ` (${this.currentReceivingFile.receivedChunks}/${this.currentReceivingFile.totalChunks} chunks)`
                        : '';
                    textSpan.textContent = 
                        `Receiving: ${this.currentReceivingFile.name} - ${progress}%${chunkInfo}`;
                }
            }
        }
    }

    showSuccess(message) {
        this.log(message, 'success');
        // You can add a toast notification here if needed
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
        successDiv.style.cssText = `
            background: #d4edda;
            color: #155724;
            padding: 15px;
            border-radius: 8px;
            margin: 10px 0;
            border: 1px solid #c3e6cb;
        `;
        document.querySelector('.container').prepend(successDiv);
        
        // Remove after 5 seconds
        setTimeout(() => successDiv.remove(), 5000);
    }

    retryConnection() {
        this.log('Retrying connection...');
        this.cleanup();
        this.retrySection.style.display = 'none';
        
        if (this.isInitiator) {
            this.createRoom();
        } else {
            this.joinRoom();
        }
    }

    cleanup() {
        if (this.isCleaningUp) return;
        this.isCleaningUp = true;
        
        this.log('Cleaning up connection...');
        
        // Clear timers
        this.clearRoomTimer();
        
        // Close WebRTC connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        // Close data channel
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        
        // Remove Firebase listeners
        if (this.offerListener && this.roomCode) {
            database.ref(`connections/${this.roomCode}/offer`).off('value', this.offerListener);
        }
        if (this.answerListener && this.roomCode) {
            database.ref(`connections/${this.roomCode}/answer`).off('value', this.answerListener);
        }
        if (this.candidateListener && this.roomCode) {
            database.ref(`connections/${this.roomCode}/candidate`).off('child_added', this.candidateListener);
        }
        
        // Clean up Firebase data
        if (this.roomCode) {
            database.ref(`connections/${this.roomCode}`).remove()
                .then(() => this.log('Firebase data cleaned up'))
                .catch(err => this.log(`Error cleaning Firebase: ${err}`, 'error'));
            this.roomCode = null;
        }
        
        // Reset UI
        this.updateConnectionStatus('Disconnected', 'disconnected');
        this.sendFilesBtn.disabled = true;
        this.sendFilesBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Files';
        this.roomCodeDisplay.textContent = '----';
        
        this.isCleaningUp = false;
    }
}

// Initialize the application
let p2pApp = null;

document.addEventListener('DOMContentLoaded', () => {
    p2pApp = new P2PFileTransfer();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (p2pApp) {
        p2pApp.cleanup();
    }
});

// Export for inline onclick handlers
window.p2pApp = p2pApp;
