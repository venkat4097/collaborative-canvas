import CanvasManager from './canvas.js';
import WebSocketClient from './websocket.js';

class CollaborativeCanvas {
    constructor() {
        this.canvas = new CanvasManager(document.getElementById('canvas'));
        
        const wsUrl = `ws://${window.location.host}`;
        this.ws = new WebSocketClient(wsUrl);
        
        this.userId = null;
        this.userColor = null;
        this.users = new Map();
        this.cursors = new Map();
        this.operations = [];
        this.lastSendTime = 0;
        
        // FIXED: Simplified undo/redo tracking
        this.myUndoStack = [];  // My operations I can undo
        this.myRedoStack = [];  // Operations I've undone that I can redo
        
        this.elements = {
            userId: document.getElementById('userId'),
            userIndicator: document.getElementById('userIndicator'),
            colorPicker: document.getElementById('colorPicker'),
            lineWidth: document.getElementById('lineWidth'),
            lineWidthValue: document.getElementById('lineWidthValue'),
            undoBtn: document.getElementById('undoBtn'),
            redoBtn: document.getElementById('redoBtn'),
            clearBtn: document.getElementById('clearBtn'),
            toolBtns: document.querySelectorAll('.tool-btn'),
            usersList: document.getElementById('usersList'),
            userCount: document.getElementById('userCount'),
            cursorsContainer: document.getElementById('cursors')
        };
        
        this.setupEventListeners();
        this.setupWebSocketHandlers();
        this.ws.connect();
    }
    
    setupEventListeners() {
        this.canvas.canvas.addEventListener('mousedown', (e) => {
            const coords = this.canvas.getCoordinates(e);
            this.canvas.startDrawing(coords.x, coords.y);
            this.lastSendTime = Date.now();
        });
        
        this.canvas.canvas.addEventListener('mousemove', (e) => {
            const coords = this.canvas.getCoordinates(e);
            
            if (this.canvas.isDrawing) {
                this.canvas.draw(coords.x, coords.y);
                
                const now = Date.now();
                if (now - this.lastSendTime > 150) {
                    if (this.canvas.currentPath.length > 0) {
                        console.log('📤 Sending draw update:', this.canvas.currentPath.length, 'points');
                        this.ws.sendDraw({
                            points: [...this.canvas.currentPath],
                            color: this.canvas.color,
                            lineWidth: this.canvas.lineWidth,
                            tool: this.canvas.tool
                        });
                        this.lastSendTime = now;
                    }
                }
            }
            
            if (!this.cursorThrottle) {
                this.cursorThrottle = true;
                setTimeout(() => {
                    this.ws.sendCursor(coords.x, coords.y);
                    this.cursorThrottle = false;
                }, 16);
            }
        });
        
        this.canvas.canvas.addEventListener('mouseup', () => {
            if (this.canvas.currentPath.length > 0) {
                console.log('📤 Sending final draw:', this.canvas.currentPath.length, 'points');
                this.ws.sendDraw({
                    points: [...this.canvas.currentPath],
                    color: this.canvas.color,
                    lineWidth: this.canvas.lineWidth,
                    tool: this.canvas.tool
                });
            }
            this.canvas.stopDrawing();
        });
        
        this.canvas.canvas.addEventListener('mouseleave', () => {
            if (this.canvas.currentPath.length > 0) {
                console.log('📤 Sending final draw (leave):', this.canvas.currentPath.length, 'points');
                this.ws.sendDraw({
                    points: [...this.canvas.currentPath],
                    color: this.canvas.color,
                    lineWidth: this.canvas.lineWidth,
                    tool: this.canvas.tool
                });
            }
            this.canvas.stopDrawing();
        });
        
        this.elements.toolBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.toolBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.canvas.setTool(btn.dataset.tool);
            });
        });
        
        this.elements.colorPicker.addEventListener('change', (e) => {
            this.canvas.setColor(e.target.value);
        });
        
        this.elements.lineWidth.addEventListener('input', (e) => {
            const width = parseInt(e.target.value);
            this.canvas.setLineWidth(width);
            this.elements.lineWidthValue.textContent = width;
        });
        
        // FIXED: Undo button with proper logging
        this.elements.undoBtn.addEventListener('click', () => {
            console.log('🔙 Undo clicked - current undo stack:', this.myUndoStack.length);
            if (this.myUndoStack.length > 0) {
                const lastOp = this.myUndoStack[this.myUndoStack.length - 1];
                console.log('🔙 Undoing operation:', lastOp.id);
                this.ws.sendUndo();
            }
        });
        
        // FIXED: Redo button with proper logging
        this.elements.redoBtn.addEventListener('click', () => {
            console.log('🔜 Redo clicked - current redo stack:', this.myRedoStack.length);
            if (this.myRedoStack.length > 0) {
                const redoOp = this.myRedoStack[this.myRedoStack.length - 1];
                console.log('🔜 Redoing operation:', redoOp.id);
                this.ws.sendRedo();
            }
        });
        
        this.elements.clearBtn.addEventListener('click', () => {
            if (confirm('Clear canvas for everyone?')) {
                this.ws.sendClear();
            }
        });
    }
    
    setupWebSocketHandlers() {
        this.ws.onInit = (userId, userColor, history, users) => {
            this.userId = userId;
            this.userColor = userColor;
            this.operations = history;
            
            // Initialize my stacks with current operations
            this.myUndoStack = history.filter(op => op.userId === userId);
            this.myRedoStack = [];
            
            this.elements.userId.textContent = `You (${userId})`;
            this.elements.userIndicator.style.backgroundColor = userColor;
            
            this.canvas.redrawFromHistory(history);
            
            users.forEach(user => {
                this.users.set(user.userId, user);
            });
            this.updateUsersList();
            this.updateUndoRedoButtons();
            
            console.log('✅ Initialized with', history.length, 'operations');
            console.log('✅ Your operations:', this.myUndoStack.length);
        };
        
        this.ws.onDraw = (operation) => {
            console.log('📥 Received draw from', operation.userId, ':', operation.data.points.length, 'points');
            this.operations.push(operation);
            
            // FIXED: If it's MY drawing, add to MY undo stack
            if (operation.userId === this.userId) {
                this.myUndoStack.push(operation);
                this.myRedoStack = [];  // Clear redo stack
                console.log('✅ Added to my undo stack. Stack size:', this.myUndoStack.length);
            }
            
            this.canvas.drawOperation(operation);
            this.updateUndoRedoButtons();
        };
        
        // FIXED: Handle undo properly
        this.ws.onUndo = (operationId, userId) => {
            console.log('🔙 Undo received from', userId, 'for operation', operationId);
            
            // Remove from operations
            const undoneOp = this.operations.find(op => op.id === operationId);
            this.operations = this.operations.filter(op => op.id !== operationId);
            
            // If it's MY operation, move it to redo stack
            if (userId === this.userId && undoneOp) {
                this.myUndoStack = this.myUndoStack.filter(op => op.id !== operationId);
                this.myRedoStack.push(undoneOp);
                console.log('✅ Moved to redo stack. Undo size:', this.myUndoStack.length, 'Redo size:', this.myRedoStack.length);
            }
            
            // Redraw canvas
            this.canvas.redrawFromHistory(this.operations);
            this.updateUndoRedoButtons();
        };
        
        // FIXED: Handle redo properly
        this.ws.onRedo = (operation) => {
            console.log('🔜 Redo received from', operation.userId);
            
            // Add back to operations
            this.operations.push(operation);
            
            // If it's MY operation, move it back to undo stack
            if (operation.userId === this.userId) {
                this.myRedoStack = this.myRedoStack.filter(op => op.id !== operation.id);
                this.myUndoStack.push(operation);
                console.log('✅ Moved back to undo stack. Undo size:', this.myUndoStack.length, 'Redo size:', this.myRedoStack.length);
            }
            
            this.canvas.drawOperation(operation);
            this.updateUndoRedoButtons();
        };
        
        this.ws.onCursor = (userId, cursor) => {
            this.updateCursor(userId, cursor);
        };
        
        this.ws.onUserJoined = (userId, userColor) => {
            this.users.set(userId, { userId, userColor });
            this.updateUsersList();
            console.log(`👤 User ${userId} joined`);
        };
        
        this.ws.onUserLeft = (userId) => {
            this.users.delete(userId);
            this.removeCursor(userId);
            this.updateUsersList();
            console.log(`👤 User ${userId} left`);
        };
        
        this.ws.onClear = () => {
            console.log('🧹 Canvas cleared');
            this.operations = [];
            this.myUndoStack = [];
            this.myRedoStack = [];
            this.canvas.clear();
            this.updateUndoRedoButtons();
        };
    }
    
    // FIXED: Update button states based on MY stacks
    updateUndoRedoButtons() {
        const canUndo = this.myUndoStack.length > 0;
        const canRedo = this.myRedoStack.length > 0;
        
        this.elements.undoBtn.disabled = !canUndo;
        this.elements.redoBtn.disabled = !canRedo;
        
        console.log(`🔘 Button update - Undo: ${canUndo ? '✅ ENABLED' : '❌ disabled'}, Redo: ${canRedo ? '✅ ENABLED' : '❌ disabled'}`);
    }
    
    updateCursor(userId, cursor) {
        const user = this.users.get(userId);
        if (!user) return;
        
        let cursorEl = this.cursors.get(userId);
        
        if (!cursorEl) {
            cursorEl = document.createElement('div');
            cursorEl.className = 'cursor';
            cursorEl.style.backgroundColor = user.userColor;
            this.elements.cursorsContainer.appendChild(cursorEl);
            this.cursors.set(userId, cursorEl);
        }
        
        cursorEl.style.left = cursor.x + 'px';
        cursorEl.style.top = cursor.y + 'px';
    }
    
    removeCursor(userId) {
        const cursorEl = this.cursors.get(userId);
        if (cursorEl) {
            cursorEl.remove();
            this.cursors.delete(userId);
        }
    }
    
    updateUsersList() {
        this.elements.usersList.innerHTML = '';
        this.elements.userCount.textContent = this.users.size + 1;
        
        const selfItem = document.createElement('div');
        selfItem.className = 'user-item';
        selfItem.innerHTML = `
            <div class="user-dot" style="background-color: ${this.userColor}"></div>
            <span>You (${this.userId})</span>
        `;
        this.elements.usersList.appendChild(selfItem);
        
        this.users.forEach(user => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.innerHTML = `
                <div class="user-dot" style="background-color: ${user.userColor}"></div>
                <span>${user.userId}</span>
            `;
            this.elements.usersList.appendChild(userItem);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CollaborativeCanvas();
});
