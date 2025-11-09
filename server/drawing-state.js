export default class DrawingState {
    constructor() {
        // Store all drawing operations
        this.operations = [];
        
        // Track undo/redo stacks per user
        this.undoStacks = new Map();
        this.redoStacks = new Map();
        
        // Track which operations are undone
        this.undoneOperations = new Set();
    }
    
    addOperation(operation) {
        this.operations.push(operation);
        
        // Clear redo stack for this user when new operation is added
        if (this.redoStacks.has(operation.userId)) {
            this.redoStacks.get(operation.userId).length = 0;
        }
        
        // Add to user's undo stack
        if (!this.undoStacks.has(operation.userId)) {
            this.undoStacks.set(operation.userId, []);
        }
        this.undoStacks.get(operation.userId).push(operation);
        
        return operation;
    }
    
    undo(userId) {
        const userStack = this.undoStacks.get(userId);
        if (!userStack || userStack.length === 0) {
            return null;
        }
        
        // Pop from undo stack
        const operation = userStack.pop();
        
        // Mark as undone
        this.undoneOperations.add(operation.id);
        
        // Add to redo stack
        if (!this.redoStacks.has(userId)) {
            this.redoStacks.set(userId, []);
        }
        this.redoStacks.get(userId).push(operation);
        
        return operation;
    }
    
    redo(userId) {
        const redoStack = this.redoStacks.get(userId);
        if (!redoStack || redoStack.length === 0) {
            return null;
        }
        
        // Pop from redo stack
        const operation = redoStack.pop();
        
        // Remove from undone set
        this.undoneOperations.delete(operation.id);
        
        // Add back to undo stack
        if (!this.undoStacks.has(userId)) {
            this.undoStacks.set(userId, []);
        }
        this.undoStacks.get(userId).push(operation);
        
        return operation;
    }
    
    getHistory() {
        // Return all operations that are not undone
        return this.operations.filter(op => !this.undoneOperations.has(op.id));
    }
    
    clear() {
        this.operations = [];
        this.undoStacks.clear();
        this.redoStacks.clear();
        this.undoneOperations.clear();
    }
    
    canUndo(userId) {
        const stack = this.undoStacks.get(userId);
        return stack && stack.length > 0;
    }
    
    canRedo(userId) {
        const stack = this.redoStacks.get(userId);
        return stack && stack.length > 0;
    }
}
