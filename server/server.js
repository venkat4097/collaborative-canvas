// import express from 'express';
// import { createServer } from 'http';
// import { WebSocketServer } from 'ws';
// import { fileURLToPath } from 'url';
// import { dirname, join } from 'path';
// import DrawingState from './drawing-state.js';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

// const app = express();
// const server = createServer(app);
// const wss = new WebSocketServer({ server });

// // Serve static files from client directory
// app.use(express.static(join(__dirname, '../client')));

// const PORT = process.env.PORT || 3000;

// // Initialize drawing state manager
// const drawingState = new DrawingState();

// // Store connected clients with metadata
// const clients = new Map();

// // Assign colors to users
// const userColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
// let colorIndex = 0;

// wss.on('connection', (ws) => {
//     // Assign user ID and color
//     const userId = Math.random().toString(36).substring(7);
//     const userColor = userColors[colorIndex % userColors.length];
//     colorIndex++;
    
//     clients.set(ws, { userId, userColor, cursor: { x: 0, y: 0 } });
    
//     console.log(`✅ User ${userId} connected with color ${userColor}`);
    
//     // Send initial state to new user
//     ws.send(JSON.stringify({
//         type: 'init',
//         userId,
//         userColor,
//         history: drawingState.getHistory(),
//         users: Array.from(clients.values())
//             .filter(c => c.userId !== userId)
//             .map(c => ({ userId: c.userId, userColor: c.userColor }))
//     }));
    
//     // Broadcast new user to all other clients
//     broadcastExcept({
//         type: 'user-joined',
//         userId,
//         userColor
//     }, ws);
    
//     // Handle incoming messages
//     ws.on('message', (data) => {
//         try {
//             const message = JSON.parse(data);
//             handleMessage(ws, message);
//         } catch (error) {
//             console.error('Error parsing message:', error);
//         }
//     });
    
//     // Handle disconnection
//     ws.on('close', () => {
//         const user = clients.get(ws);
//         if (user) {
//             console.log(`❌ User ${user.userId} disconnected`);
//             clients.delete(ws);
            
//             // Broadcast user left
//             broadcastAll({
//                 type: 'user-left',
//                 userId: user.userId
//             });
//         }
//     });
    
//     ws.on('error', (error) => {
//         console.error('WebSocket error:', error);
//     });
// });

// function handleMessage(ws, message) {
//     const user = clients.get(ws);
//     if (!user) return;
    
//     switch (message.type) {
//         case 'draw':
//             console.log(`📝 Draw from ${user.userId}: ${message.data.points.length} points`);
            
//             // Add operation to history
//             const operation = {
//                 id: Date.now() + Math.random(),
//                 userId: user.userId,
//                 type: 'draw',
//                 data: message.data,
//                 timestamp: Date.now()
//             };
//             drawingState.addOperation(operation);
            
//             // FIXED: Broadcast to ALL clients including sender
//             broadcastAll({
//                 type: 'draw',
//                 operation
//             });
//             break;
            
//         case 'undo':
//             const undoOp = drawingState.undo(user.userId);
//             if (undoOp) {
//                 broadcastAll({
//                     type: 'undo',
//                     operationId: undoOp.id,
//                     userId: user.userId
//                 });
//             }
//             break;
            
//         case 'redo':
//             const redoOp = drawingState.redo(user.userId);
//             if (redoOp) {
//                 broadcastAll({
//                     type: 'redo',
//                     operation: redoOp
//                 });
//             }
//             break;
            
//         case 'cursor':
//             if (user) {
//                 user.cursor = message.data;
//             }
            
//             // Broadcast cursor position - exclude sender
//             broadcastExcept({
//                 type: 'cursor',
//                 userId: user.userId,
//                 cursor: message.data
//             }, ws);
//             break;
            
//         case 'clear':
//             drawingState.clear();
//             broadcastAll({
//                 type: 'clear'
//             });
//             break;
//     }
// }

// // Send to ALL clients including sender
// function broadcastAll(message) {
//     const messageStr = JSON.stringify(message);
    
//     wss.clients.forEach((client) => {
//         if (client.readyState === 1) { // 1 = OPEN
//             client.send(messageStr);
//         }
//     });
// }

// // Send to all EXCEPT the sender
// function broadcastExcept(message, excludeWs) {
//     const messageStr = JSON.stringify(message);
    
//     wss.clients.forEach((client) => {
//         if (client !== excludeWs && client.readyState === 1) {
//             client.send(messageStr);
//         }
//     });
// }

// server.listen(PORT, () => {
//     console.log(`🚀 Server running on http://localhost:${PORT}`);
//     console.log(`🔌 WebSocket server ready for connections`);
// });
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import DrawingState from './drawing-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(join(__dirname, '../client')));

const PORT = process.env.PORT || 3000;

const drawingState = new DrawingState();
const clients = new Map();

const userColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
let colorIndex = 0;

wss.on('connection', (ws) => {
    const userId = Math.random().toString(36).substring(7);
    const userColor = userColors[colorIndex % userColors.length];
    colorIndex++;
    
    clients.set(ws, { userId, userColor, cursor: { x: 0, y: 0 } });
    
    console.log(`\n✅ User ${userId} connected (Total: ${wss.clients.size})`);
    
    // Send initial state
    ws.send(JSON.stringify({
        type: 'init',
        userId,
        userColor,
        history: drawingState.getHistory(),
        users: Array.from(clients.values())
            .filter(c => c.userId !== userId)
            .map(c => ({ userId: c.userId, userColor: c.userColor }))
    }));
    
    // Broadcast new user to others
    broadcastExcept({
        type: 'user-joined',
        userId,
        userColor
    }, ws);
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleMessage(ws, message);
        } catch (error) {
            console.error('❌ Parse error:', error.message);
        }
    });
    
    ws.on('close', () => {
        const user = clients.get(ws);
        if (user) {
            console.log(`\n❌ User ${user.userId} disconnected (Total: ${wss.clients.size - 1})`);
            clients.delete(ws);
            
            broadcastAll({
                type: 'user-left',
                userId: user.userId
            });
        }
    });
    
    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
    });
});

function handleMessage(ws, message) {
    const user = clients.get(ws);
    if (!user) {
        console.log('❌ Message from unknown user');
        return;
    }
    
    switch (message.type) {
        case 'draw':
            console.log(`📝 Draw from ${user.userId}: ${message.data.points.length} points`);
            
            const operation = {
                id: Date.now() + Math.random(),
                userId: user.userId,
                type: 'draw',
                data: message.data,
                timestamp: Date.now()
            };
            drawingState.addOperation(operation);
            
            // Broadcast to ALL
            console.log(`   ↳ Broadcasting to ${wss.clients.size} clients...`);
            let sent = 0;
            wss.clients.forEach((client) => {
                if (client.readyState === 1) {
                    client.send(JSON.stringify({
                        type: 'draw',
                        operation
                    }));
                    sent++;
                }
            });
            console.log(`   ✅ Sent to ${sent} clients`);
            break;
            
        case 'undo':
            const undoOp = drawingState.undo(user.userId);
            if (undoOp) {
                broadcastAll({
                    type: 'undo',
                    operationId: undoOp.id,
                    userId: user.userId
                });
            }
            break;
            
        case 'redo':
            const redoOp = drawingState.redo(user.userId);
            if (redoOp) {
                broadcastAll({
                    type: 'redo',
                    operation: redoOp
                });
            }
            break;
            
        case 'cursor':
            if (user) {
                user.cursor = message.data;
            }
            broadcastExcept({
                type: 'cursor',
                userId: user.userId,
                cursor: message.data
            }, ws);
            break;
            
        case 'clear':
            drawingState.clear();
            broadcastAll({
                type: 'clear'
            });
            break;
    }
}

function broadcastAll(message) {
    const messageStr = JSON.stringify(message);
    let sent = 0;
    
    wss.clients.forEach((client) => {
        if (client.readyState === 1) {
            client.send(messageStr);
            sent++;
        }
    });
    
    if (message.type !== 'cursor') {
        console.log(`📡 Broadcast ${message.type} to ${sent} clients`);
    }
}

function broadcastExcept(message, excludeWs) {
    const messageStr = JSON.stringify(message);
    let sent = 0;
    
    wss.clients.forEach((client) => {
        if (client !== excludeWs && client.readyState === 1) {
            client.send(messageStr);
            sent++;
        }
    });
    
    console.log(`📡 Broadcast ${message.type} to ${sent} other clients`);
}

server.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket server ready\n`);
});
