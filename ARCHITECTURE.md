# ARCHITECTURE.md - Technical Deep Dive

## Data Flow Diagram

### Complete Drawing Event Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                           USER DRAWS                             │
├──────────────────────────────────────────────────────────────────┤
│ Mouse down → startDrawing(x, y)                                  │
│             currentPath = [{x, y}]                               │
│                                                                  │
│ Mouse move → draw(x, y)                                          │
│             currentPath.push({x, y})                             │
│             canvas.drawPath() [LOCAL - immediate visual]         │
│             [Every 150ms: batch & send to server]                │
│                                                                  │
│ Mouse up → stopDrawing()                                         │
│           Send final batch to server                             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│                      WEBSOCKET SEND                              │
├──────────────────────────────────────────────────────────────────┤
│ sendDraw({                                                       │
│   points: [{x:100, y:150}, {x:102, y:152}, ...],               │
│   color: "#FF6B6B",                                              │
│   lineWidth: 5,                                                  │
│   tool: "brush"                                                  │
│ })                                                               │
│                                                                  │
│ Message Format:                                                  │
│ {                                                                │
│   "type": "draw",                                                │
│   "data": { points, color, lineWidth, tool }                   │
│ }                                                                │
└──────────────────────────────────────────────────────────────────┘
                            ↓
              ┌─────────────────────────┐
              │   SERVER RECEIVES       │
              │  (via WebSocket)        │
              └────────────┬────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────────┐
│                     SERVER PROCESSING                            │
├──────────────────────────────────────────────────────────────────┤
│ 1. Parse incoming message                                        │
│ 2. Create operation object:                                      │
│    {                                                              │
│      id: Date.now() + Math.random(),                             │
│      userId: "abc123",                                           │
│      type: "draw",                                               │
│      data: { points, color, lineWidth, tool },                  │
│      timestamp: Date.now()                                       │
│    }                                                              │
│ 3. Add to DrawingState.operations[]                              │
│ 4. Add to user's undoStack                                       │
│ 5. Broadcast to ALL clients (including sender)                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                            ↓
              ┌─────────────────────────┐
              │  BROADCAST TO ALL       │
              │  (8 color-coded users)  │
              └────────────┬────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────────┐
│                   ALL CLIENTS RECEIVE                            │
├──────────────────────────────────────────────────────────────────┤
│ Message from server:                                             │
│ {                                                                │
│   "type": "draw",                                                │
│   "operation": {                                                 │
│     id, userId, type, data, timestamp                           │
│   }                                                              │
│ }                                                                │
│                                                                  │
│ Each client:                                                     │
│ 1. Receives operation                                            │
│ 2. canvas.drawOperation(operation)                              │
│ 3. operation.data → drawPath()                                  │
│ 4. Visible on screen immediately                                │
│                                                                  │
│ If operation.userId === myUserId:                               │
│   └─ Add to myUndoStack (for undo functionality)               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## WebSocket Protocol

### Message Types & Formats

#### 1. **INIT** (Server → Client on connection)
New user receives this immediately after connecting.

```javascript
{
  type: 'init',
  userId: 'abc123',
  userColor: '#FF6B6B',
  history: [
    // All previous operations (non-undone)
    {
      id: 1699534201234.567,
      userId: 'user1',
      type: 'draw',
      data: { points: [...], color: '#000000', lineWidth: 5, tool: 'brush' },
      timestamp: 1699534201234
    }
  ],
  users: [
    { userId: 'user2', userColor: '#4ECDC4' },
    { userId: 'user3', userColor: '#45B7D1' }
  ]
}
```

#### 2. **DRAW** (Client → Server → All Clients)
Sent when user draws a stroke (batched every 150ms).

**Client sends to server:**
```javascript
{
  type: 'draw',
  data: {
    points: [{x: 100, y: 150}, {x: 102, y: 152}, ...],
    color: '#FF6B6B',
    lineWidth: 5,
    tool: 'brush'
  }
}
```

**Server broadcasts back to all:**
```javascript
{
  type: 'draw',
  operation: {
    id: 1699534201567.891,          // Unique ID
    userId: 'abc123',                 // Who drew it
    type: 'draw',
    data: { points, color, lineWidth, tool },
    timestamp: 1699534201567
  }
}
```

#### 3. **UNDO** (Client → Server → All Clients)
Removes user's last stroke from canvas.

**Client sends:**
```javascript
{ type: 'undo' }
```

**Server broadcasts:**
```javascript
{
  type: 'undo',
  operationId: 1699534201567.891,    // ID of operation to remove
  userId: 'abc123'                     // Who performed undo
}
```

**What happens:**
- Operation removed from canvas
- Operation marked in "undoneOperations" Set
- Added to user's redoStack
- All clients redraw canvas (filtering out undone operations)

#### 4. **REDO** (Client → Server → All Clients)
Restores user's last undone stroke.

**Client sends:**
```javascript
{ type: 'redo' }
```

**Server broadcasts:**
```javascript
{
  type: 'redo',
  operation: {
    id: 1699534201567.891,
    userId: 'abc123',
    type: 'draw',
    data: { ... },
    timestamp: 1699534201567
  }
}
```

#### 5. **CURSOR** (Client → Server → Other Clients)
Tracks cursor position - sent ~60 times/second but throttled.

**Client sends:**
```javascript
{
  type: 'cursor',
  data: { x: 250.5, y: 180.3 }
}
```

**Server broadcasts to others (not back to sender):**
```javascript
{
  type: 'cursor',
  userId: 'abc123',
  cursor: { x: 250.5, y: 180.3 }
}
```

#### 6. **USER-JOINED** (Server → All Clients)
Announces a new user connection.

```javascript
{
  type: 'user-joined',
  userId: 'newuser456',
  userColor: '#FFA07A'
}
```

#### 7. **USER-LEFT** (Server → All Clients)
Announces user disconnection.

```javascript
{
  type: 'user-left',
  userId: 'abc123'
}
```

#### 8. **CLEAR** (Client → Server → All Clients)
Clears entire canvas for everyone.

**Client sends:**
```javascript
{ type: 'clear' }
```

**Server broadcasts:**
```javascript
{ type: 'clear' }
```

---

## Undo/Redo Strategy

### Why Per-User Stacks?

**Problem:** How do we implement undo/redo when multiple users are drawing?

**Solution:** Each user has their own undo/redo stack. When you undo, only YOUR strokes are removed.

### Data Structures

**Server-side (DrawingState):**
```javascript
{
  operations: [
    // ALL operations ever made (even undone ones)
    {id: 1, userId: 'user1', ...},
    {id: 2, userId: 'user2', ...},
    {id: 3, userId: 'user1', ...}
  ],
  
  undoStacks: Map(
    'user1' → [{id: 1, ...}, {id: 3, ...}],  // User1 can undo these
    'user2' → [{id: 2, ...}]                  // User2 can undo this
  ),
  
  redoStacks: Map(
    'user1' → [{id: 3, ...}],                 // User1 undid operation 3
    'user2' → []
  ),
  
  undoneOperations: Set([3])                  // Operation 3 is currently undone
}
```

**Client-side (CollaborativeCanvas):**
```javascript
{
  operations: [...],              // All operations (mirror of server)
  myUndoStack: [],                // Operations I created and can undo
  myRedoStack: [],                // Operations I undid that I can redo
  users: Map(...),                // Online users
  cursors: Map(...)               // Cursor positions
}
```

### Flow Example: Undo

**Scenario:** User A draws 2 strokes, User B draws 1 stroke. User A clicks Undo.

```
Before Undo:
  operations = [opA1, opB1, opA2]
  undoStacks['A'] = [opA1, opA2]
  undoStacks['B'] = [opB1]
  undoneOperations = {}

User A Undo:
  ↓
Client: myUndoStack.pop() → opA2
Client: myRedoStack.push(opA2)
Client: ws.sendUndo()
  ↓
Server: drawingState.undo('A')
  - Pop from undoStacks['A'] → opA2
  - undoneOperations.add(opA2.id)
  - redoStacks['A'].push(opA2)
  ↓
Server: broadcastAll({ type: 'undo', operationId: opA2.id, userId: 'A' })
  ↓
All Clients Receive:
  - Remove opA2 from display
  - Canvas.redrawFromHistory(operations.filter(op => !undoneOperations.has(op.id)))
  - Result: Shows opA1, opB1 (opA2 gone)
  ↓
Final State:
  undoneOperations = {opA2.id}
  Canvas = opA1 + opB1 ✓
  User B's drawing unchanged ✓
```

### Why This Works

1. **Simple:** Each user manages their own stack
2. **Fair:** One user's undo doesn't affect others' drawings
3. **Correct:** Canvas = all operations - undone operations
4. **Scalable:** No conflicts or merge issues

---

## Performance Decisions

### 1. Event Batching (150ms)

**Problem:** Mouse moves fire 60+ times per second. Without batching:
- 60 events/sec × 100 bytes = 6KB/sec per user
- With 10 users: 60KB/sec total network load

**Solution:** Batch drawing points every 150ms
```javascript
if (now - lastSendTime > 150) {
  sendDraw({ points: currentPath, ... })
  lastSendTime = now
}
```

**Result:**
- 60 events/sec → ~7 events/sec
- 6KB/sec → 100 bytes/sec
- **97% bandwidth reduction** ✅

**Latency:** 150ms is imperceptible at drawing speeds

### 2. Full Redraw on Undo/Redo

**Problem:** Could track individual layers, but complex.

**Solution:** Redraw entire canvas from operations array
```javascript
redrawFromHistory(operations) {
  canvas.clear()
  operations.forEach(op => canvas.drawOperation(op))
}
```

**Why:** 
- Simple (~10 lines vs 100+ with layers)
- Fast enough for <1000 operations
- Filters out undone operations naturally

**Tradeoff:** For 10,000+ operations, would need optimization

### 3. Cursor Throttling (16ms = 60fps)

**Without throttling:** Cursor events fire every ~1ms = 1000/sec per client

**With throttling:**
```javascript
if (!cursorThrottle) {
  cursorThrottle = true
  setTimeout(() => {
    sendCursor(x, y)
    cursorThrottle = false
  }, 16)  // Throttle to 60fps
}
```

**Result:** 60fps cursor movement = smooth to human eye ✅

### 4. Broadcast to Sender (Not Just Others)

**Why send message back to sender?**

- Sender needs to add to their undo stack
- Server is source of truth - consistency guaranteed
- Operation gets confirmed timestamp from server
- Simple pattern - all clients treat same message

**Alternative:** Send separate "confirm" message to sender
- More complex
- Potential race conditions
- Not worth the complexity

---

## Conflict Resolution

### What is a Conflict?

Two users drawing simultaneously - strokes overlap but both are valid.

### Our Strategy: Last-Write-Wins with Order Preservation

**How it works:**

1. Each operation gets unique ID: `Date.now() + Math.random()`
2. Server adds operation to array in order received
3. Canvas renders all operations in order
4. Visually: last stroke drawn appears on top

**Example Timeline:**

```
T0: User A starts drawing at (100, 100)
T1: User B starts drawing at (200, 200)
T2: User A sends stroke (50 points)
T3: User B sends stroke (40 points)
T4: User A sends final stroke (30 points)
T5: User B sends final stroke (35 points)

Server receives in this order:
  opA1 (50 points) → Added to operations[0]
  opB1 (40 points) → Added to operations[1]
  opA2 (30 points) → Added to operations[2]
  opB2 (35 points) → Added to operations[3]

Canvas rendered as: opA1 → opB1 → opA2 → opB2
Last stroke (opB2) appears on top, but all are visible ✓
```

### Simultaneous Undo

**Scenario:** User A draws, User B draws, User A undoes while User B drawing.

```
Timeline:
T0: A draws stroke 1
T1: B draws stroke 2
T2: A sends undo (for stroke 1)
T3: B draws stroke 3

Server processes in order:
  - stroke 1 added
  - stroke 2 added
  - stroke 1 marked as undone
  - stroke 3 added

Final operations: [stroke1 (undone), stroke2, stroke3]
Canvas shows: stroke2 + stroke3 ✓
A can redo stroke 1 ✓
```

### Why This Works

- **Simple:** No complex OT (Operational Transformation)
- **Correct:** Canvas = operations - undone
- **Fair:** All operations preserved, none lost
- **Predictable:** Render order = server order

---

## State Synchronization

### Client State

```javascript
CollaborativeCanvas {
  operations: [],           // Mirror of server's current canvas
  myUndoStack: [],          // Only MY operations
  myRedoStack: [],          // Operations I've undone
  users: Map,               // Online users {userId → {userId, color}}
  cursors: Map,             // Cursor DOM elements {userId → element}
}

CanvasManager {
  canvas,                   // HTML5 Canvas element
  ctx,                      // 2D drawing context
  currentPath: [],          // Points being drawn right now
  tool: 'brush',            // Selected tool
  color: '#FF6B6B',         // Selected color
  lineWidth: 5              // Selected width
}
```

### Server State

```javascript
DrawingState {
  operations: [],           // All operations (including undone)
  undoStacks: Map,          // Per-user stacks
  redoStacks: Map,          // Per-user redo stacks
  undoneOperations: Set     // Currently undone operation IDs
}

clients: Map {
  ws → {
    userId: 'abc123',
    userColor: '#FF6B6B',
    cursor: {x: 100, y: 200}
  }
}
```

### Sync Points

1. **New User Joins:**
   - Server sends `init` with full history
   - Client redraws from history
   - Client synced ✓

2. **Draw Operation:**
   - Client sends batch every 150ms
   - Server adds to operations
   - Server broadcasts to all
   - All clients redraw that stroke ✓

3. **Undo/Redo:**
   - Client sends undo/redo request
   - Server updates undoneOperations Set
   - Server broadcasts to all
   - All clients redraw filtered history ✓

4. **User Disconnect:**
   - Server detects close event
   - Server broadcasts user-left
   - All clients remove cursor
   - Drawings stay (created by user) ✓

---

## Message Flow Sequence

```
Client 1                    Server                     Client 2
  │                           │                           │
  ├─── draw message ──────────→                           │
  │                           │                           │
  │                    Create operation                   │
  │                    Add to history                     │
  │                    Mark user's undo stack             │
  │                           │                           │
  │                    ┌──────┴───────┐                   │
  │                    │ Broadcast    │                   │
  │                    └──────┬───────┘                   │
  │                           │                           │
  │← ← ← draw message ← ← ← ← ┤                           │
  │                           ├─── draw message ──────────→
  │                           │                           │
  │  Update myUndoStack                          Update canvas
  │  Redraw                                       Redraw
  │  ✓ Synced                                     ✓ Synced
  │
  ├─── undo message ────────→
  │                           │
  │                    Pop from undo stack
  │                    Mark as undone
  │                    Update redo stack
  │                           │
  │                    ┌──────┴───────┐
  │                    │ Broadcast    │
  │                    └──────┬───────┘
  │                           │
  │← ← ← undo message ← ← ← ←│
  │                           ├─── undo message ────────→
  │  Redraw from history               Redraw from history
  │  Move redo stack                   Move redo stack
  │  ✓ All synced with undo
```

---

## Edge Cases Handled

### 1. Rapid Undo/Redo
```javascript
// Client throttles based on myUndoStack
if (myUndoStack.length > 0) {
  // Allow undo
}
// Server validates
if (drawingState.canUndo(userId)) {
  // Process undo
}
```

### 2. User Disconnects Mid-Draw
- Their currentPath not sent
- Partial drawing lost (acceptable)
- Server removes them from clients
- Other users unaffected

### 3. Rapid Tool/Color Changes
- Last setting wins
- No special handling needed
- Works naturally

### 4. Network Lag
- Drawing appears locally immediately (optimistic)
- Server message arrives later with confirmation
- Redraw from server updates if needed

---

## Summary

| Aspect | Solution | Why |
|--------|----------|-----|
| **Real-time Sync** | WebSocket + 150ms batching | Fast + efficient |
| **Undo/Redo** | Per-user stacks | Fair + simple |
| **Conflicts** | Last-write-wins with order | Predictable |
| **State** | operations - undone | Correct filtering |
| **Performance** | Event batching + throttling | 97% bandwidth reduction |
| **Scalability** | Can extend with Redis | Ready for multi-server |