export default class WebSocketClient {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.reconnectInterval = 3000;
        this.shouldReconnect = true;
        
        // Callbacks
        this.onInit = null;
        this.onDraw = null;
        this.onUndo = null;
        this.onRedo = null;
        this.onCursor = null;
        this.onUserJoined = null;
        this.onUserLeft = null;
        this.onClear = null;
        this.onOpen = null;
        this.onClose = null;
    }
    
    connect() {
        try {
            console.log('🔄 Connecting to WebSocket...');
            this.ws = new WebSocket(this.url);
            
            this.ws.onopen = () => {
                console.log('✅ Connected to WebSocket server');
                if (this.onOpen) this.onOpen();
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    
                    // Log all messages except cursor
                    if (message.type !== 'cursor') {
                        console.log(`📨 Received: ${message.type}`, message);
                    }
                    
                    this.handleMessage(message);
                } catch (error) {
                    console.error('❌ Error parsing message:', error);
                }
            };
            
            this.ws.onclose = () => {
                console.log('❌ Disconnected from WebSocket server');
                if (this.onClose) this.onClose();
                
                if (this.shouldReconnect) {
                    setTimeout(() => this.connect(), this.reconnectInterval);
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('❌ WebSocket error:', error);
            };
        } catch (error) {
            console.error('❌ Connection error:', error);
            if (this.shouldReconnect) {
                setTimeout(() => this.connect(), this.reconnectInterval);
            }
        }
    }
    
    handleMessage(message) {
        switch (message.type) {
            case 'init':
                if (this.onInit) {
                    console.log('✅ Init message received');
                    this.onInit(message.userId, message.userColor, message.history, message.users);
                }
                break;
                
            case 'draw':
                if (this.onDraw) {
                    console.log('✅ Draw message - rendering', message.operation.data.points.length, 'points');
                    this.onDraw(message.operation);
                } else {
                    console.log('❌ onDraw callback not set!');
                }
                break;
                
            case 'undo':
                if (this.onUndo) {
                    this.onUndo(message.operationId, message.userId);
                }
                break;
                
            case 'redo':
                if (this.onRedo) {
                    this.onRedo(message.operation);
                }
                break;
                
            case 'cursor':
                if (this.onCursor) {
                    this.onCursor(message.userId, message.cursor);
                }
                break;
                
            case 'user-joined':
                if (this.onUserJoined) {
                    console.log('👤 User joined:', message.userId);
                    this.onUserJoined(message.userId, message.userColor);
                }
                break;
                
            case 'user-left':
                if (this.onUserLeft) {
                    console.log('👤 User left:', message.userId);
                    this.onUserLeft(message.userId);
                }
                break;
                
            case 'clear':
                if (this.onClear) {
                    this.onClear();
                }
                break;
        }
    }
    
    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('⚠️ WebSocket not connected, message not sent:', message.type);
        }
    }
    
    sendDraw(pathData) {
        console.log(`📤 Sending draw: ${pathData.points.length} points`);
        this.send({
            type: 'draw',
            data: pathData
        });
    }
    
    sendUndo() {
        console.log('📤 Sending undo');
        this.send({
            type: 'undo'
        });
    }
    
    sendRedo() {
        console.log('📤 Sending redo');
        this.send({
            type: 'redo'
        });
    }
    
    sendCursor(x, y) {
        this.send({
            type: 'cursor',
            data: { x, y }
        });
    }
    
    sendClear() {
        console.log('📤 Sending clear');
        this.send({
            type: 'clear'
        });
    }
    
    disconnect() {
        this.shouldReconnect = false;
        if (this.ws) {
            this.ws.close();
        }
    }
}
