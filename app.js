class P2PFileTransfer {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.roomCode = null;
        this.isInitiator = false;
        this.filesToSend = [];
        this.currentFileIndex = 0;
        this.chunkSize = 16384; // 16KB chunks
        
        this.init();
    }

    init() {
        // DOM Elements
        this.createRoomBtn = document.getElementById('createRoom');
        this.joinRoomBtn = document.getElementById('joinRoom');
        this.roomCodeInput = document.getElementById('roomCode');
        this.roomCodeDisplay = document.getElementById('roomCodeDisplay');
        this.transferSection = document.getElementById('transferSection');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.fileInput = document.getElementById('fileInput');
        this.selectFilesBtn = document.getElementById('selectFiles');
        this.dropArea = document.getElementById('dropArea');
        this.sendFilesBtn = document.getElementById('sendFiles');
        this.fileList = document.getElementById('fileList');
        this.progressSection = document.getElementById('progressSection');
        this.progressBar = document.getElementById('progressBar');
        this.progressText = document.getElementById('progressText');
        this.receivedFiles = document.getElementById('receivedFiles');

        // Event Listeners
        this.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.selectFilesBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
        this.sendFilesBtn.addEventListener('click', () => this.sendFiles());
        
        // Drag and drop
        this.setupDragAndDrop();
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

    async createRoom() {
        this.roomCode = this.generateRoomCode();
        this.isInitiator = true;
        
        this.roomCodeDisplay.textContent = this.roomCode;
        this.connectionStatus.textContent = 'Waiting for peer to join...';
        this.connectionStatus.className = 'disconnected';
        
        this.transferSection.style.display = 'block';
        
        // Initialize WebRTC
        await this.initWebRTC();
        
        // Listen for answer
        this.listenForAnswer();
    }

    async joinRoom() {
        this.roomCode = this.roomCodeInput.value;
        if (!this.roomCode || this.roomCode.length !== 4) {
            alert('Please enter a valid 4-digit code');
            return;
        }
        
        this.isInitiator = false;
        this.roomCodeDisplay.textContent = this.roomCode;
        this.transferSection.style.display = 'block';
        
        await this.initWebRTC();
        this.listenForOffer();
    }

    async initWebRTC() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        this.peerConnection = new RTCPeerConnection(configuration);
        
        // Set up data channel
        if (this.isInitiator) {
            this.dataChannel = this.peerConnection.createDataChannel('fileTransfer');
            this.setupDataChannel();
        } else {
            this.peerConnection.ondatachannel = (event) => {
                this.dataChannel = event.channel;
                this.setupDataChannel();
            };
        }

        // ICE candidate handling
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                database.ref(`connections/${this.roomCode}/candidate`).push({
                    candidate: event.candidate,
                    sender: this.isInitiator ? 'offerer' : 'answerer'
                });
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            if (this.peerConnection.connectionState === 'connected') {
                this.connectionStatus.textContent = 'Connected to peer ✓';
                this.connectionStatus.className = 'connected';
            }
        };
    }

    setupDataChannel() {
        this.dataChannel.onopen = () => {
            console.log('Data channel opened');
            this.sendFilesBtn.disabled = false;
        };

        this.dataChannel.onclose = () => {
            console.log('Data channel closed');
        };

        this.dataChannel.onmessage = (event) => {
            this.handleIncomingData(event.data);
        };
    }

    async listenForOffer() {
        database.ref(`connections/${this.roomCode}/offer`).on('value', async (snapshot) => {
            const offer = snapshot.val();
            if (offer && !this.peerConnection.currentRemoteDescription) {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                
                // Create answer
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                
                // Send answer
                database.ref(`connections/${this.roomCode}/answer`).set(answer);
                
                // Listen for ICE candidates
                this.listenForIceCandidates();
            }
        });
    }

    async listenForAnswer() {
        database.ref(`connections/${this.roomCode}/answer`).on('value', async (snapshot) => {
            const answer = snapshot.val();
            if (answer && this.peerConnection.signalingState === 'have-local-offer') {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                this.listenForIceCandidates();
            }
        });
    }

    listenForIceCandidates() {
        database.ref(`connections/${this.roomCode}/candidate`).on('child_added', async (snapshot) => {
            const data = snapshot.val();
            if (data && this.peerConnection.remoteDescription) {
                try {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    console.error('Error adding ICE candidate:', e);
                }
            }
        });
    }

    async createAndSendOffer() {
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        database.ref(`connections/${this.roomCode}/offer`).set(offer);
    }

    handleFiles(files) {
        this.filesToSend = Array.from(files);
        this.updateFileList();
    }

    updateFileList() {
        this.fileList.innerHTML = '';
        this.filesToSend.forEach((file, index) => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.innerHTML = `
                <span>${file.name} (${this.formatFileSize(file.size)})</span>
                <button onclick="app.removeFile(${index})">×</button>
            `;
            this.fileList.appendChild(div);
        });
    }

    removeFile(index) {
        this.filesToSend.splice(index, 1);
        this.updateFileList();
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
            alert('Please select files and ensure connection is established');
            return;
        }

        this.progressSection.style.display = 'block';
        this.currentFileIndex = 0;
        
        for (let i = 0; i < this.filesToSend.length; i++) {
            await this.sendFile(this.filesToSend[i]);
            this.currentFileIndex++;
        }
        
        // Send completion message
        this.dataChannel.send(JSON.stringify({
            type: 'transfer_complete'
        }));
    }

    async sendFile(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            const fileSize = file.size;
            let offset = 0;
            
            // Send file metadata first
            this.dataChannel.send(JSON.stringify({
                type: 'file_start',
                name: file.name,
                size: file.size,
                type: file.type,
                totalFiles: this.filesToSend.length,
                currentFile: this.currentFileIndex + 1
            }));

            reader.onload = (e) => {
                const buffer = e.target.result;
                const bytes = new Uint8Array(buffer);
                
                const sendNextChunk = () => {
                    if (offset >= fileSize) {
                        // File complete
                        this.dataChannel.send(JSON.stringify({
                            type: 'file_end',
                            name: file.name
                        }));
                        
                        resolve();
                        return;
                    }
                    
                    const chunk = bytes.slice(offset, offset + this.chunkSize);
                    this.dataChannel.send(chunk);
                    
                    offset += this.chunkSize;
                    
                    // Update progress
                    const progress = Math.min(100, Math.round((offset / fileSize) * 100));
                    const totalProgress = Math.round(
                        (this.currentFileIndex / this.filesToSend.length) * 100 + 
                        (progress / this.filesToSend.length)
                    );
                    
                    this.updateProgress(totalProgress, file.name, progress);
                    
                    // Schedule next chunk
                    setTimeout(sendNextChunk, 0);
                };
                
                sendNextChunk();
            };
            
            reader.readAsArrayBuffer(file);
        });
    }

    updateProgress(totalProgress, fileName, fileProgress) {
        this.progressBar.style.width = `${totalProgress}%`;
        this.progressText.textContent = `Sending "${fileName}" - ${fileProgress}% (Total: ${totalProgress}%)`;
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
                    totalFiles: message.totalFiles,
                    currentFile: message.currentFile
                };
                this.receivedFiles.innerHTML += `
                    <div class="file-item">
                        Receiving: ${message.name} (${this.formatFileSize(message.size)})
                    </div>
                `;
                break;
                
            case 'file_end':
                if (this.currentReceivingFile) {
                    // Combine chunks and create download link
                    const blob = new Blob(this.currentReceivingFile.data, 
                        { type: this.currentReceivingFile.type });
                    const url = URL.createObjectURL(blob);
                    
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = this.currentReceivingFile.name;
                    link.textContent = `Download ${this.currentReceivingFile.name}`;
                    link.className = 'btn-secondary';
                    link.style.margin = '10px';
                    
                    this.receivedFiles.appendChild(link);
                    this.receivedFiles.appendChild(document.createElement('br'));
                    
                    this.currentReceivingFile = null;
                }
                break;
                
            case 'transfer_complete':
                alert('File transfer completed!');
                this.progressSection.style.display = 'none';
                break;
        }
    }

    handleFileChunk(chunk) {
        if (this.currentReceivingFile) {
            this.currentReceivingFile.data.push(chunk);
            this.currentReceivingFile.received += chunk.byteLength;
            
            const progress = Math.round(
                (this.currentReceivingFile.received / this.currentReceivingFile.size) * 100
            );
            
            this.progressBar.style.width = `${progress}%`;
            this.progressText.textContent = 
                `Receiving "${this.currentReceivingFile.name}" - ${progress}%`;
        }
    }

    cleanup() {
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        if (this.roomCode) {
            database.ref(`connections/${this.roomCode}`).remove();
        }
    }
}

// Initialize app
const app = new P2PFileTransfer();

// Cleanup on page unload
window.addEventListener('beforeunload', () => app.cleanup());