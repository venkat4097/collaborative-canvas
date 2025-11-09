export default class CanvasManager {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        
        // Resize canvas to container
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Drawing state
        this.isDrawing = false;
        this.currentPath = [];
        this.tool = 'brush';
        this.color = '#000000';
        this.lineWidth = 5;
        
        // Setup canvas properties
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // Callbacks
        this.onDrawStart = null;
        this.onDrawing = null;
        this.onDrawEnd = null;
    }
    
    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
    }
    
    startDrawing(x, y) {
        this.isDrawing = true;
        this.currentPath = [{ x, y }];
        
        if (this.onDrawStart) {
            this.onDrawStart({ x, y });
        }
    }
    
    draw(x, y) {
        if (!this.isDrawing) return;
        
        this.currentPath.push({ x, y });
        
        // Draw path locally for immediate feedback
        this.drawPath(this.currentPath, this.color, this.lineWidth, this.tool);
        
        if (this.onDrawing) {
            this.onDrawing({ x, y });
        }
    }
    
    stopDrawing() {
        if (!this.isDrawing) return;
        
        this.isDrawing = false;
        
        if (this.currentPath.length > 0 && this.onDrawEnd) {
            const pathData = {
                points: this.currentPath,
                color: this.color,
                lineWidth: this.lineWidth,
                tool: this.tool
            };
            this.onDrawEnd(pathData);
        }
        
        this.currentPath = [];
    }
    
    drawPath(points, color, lineWidth, tool = 'brush') {
        if (points.length < 1) return;
        
        this.ctx.save();
        
        if (tool === 'eraser') {
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.strokeStyle = color;
        }
        
        this.ctx.lineWidth = lineWidth;
        
        // Draw all points in a single path
        this.ctx.beginPath();
        this.ctx.moveTo(points.x, points.y);
        
        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
        }
        
        this.ctx.stroke();
        this.ctx.restore();
    }
    
    drawOperation(operation) {
        const { points, color, lineWidth, tool } = operation.data;
        this.drawPath(points, color, lineWidth, tool);
    }
    
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    redrawFromHistory(operations) {
        this.clear();
        operations.forEach(op => {
            if (op.type === 'draw') {
                this.drawOperation(op);
            }
        });
    }
    
    setTool(tool) {
        this.tool = tool;
    }
    
    setColor(color) {
        this.color = color;
    }
    
    setLineWidth(width) {
        this.lineWidth = width;
    }
    
    getCoordinates(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    }
}
