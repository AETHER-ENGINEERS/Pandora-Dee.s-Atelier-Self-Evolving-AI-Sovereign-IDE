export class DragManager {
  constructor() {
    this.draggedElement = null;
    this.offset = { x: 0, y: 0 };
  }

  makeDraggable(element) {
    element.addEventListener('pointerdown', (e) => this.startDragging(e));
    element.addEventListener('pointermove', (e) => this.drag(e));
    element.addEventListener('pointerup', () => this.stopDragging());
    element.addEventListener('pointerleave', () => this.stopDragging());
  }

  startDragging(e) {
    this.draggedElement = e.target.closest('.happy-thing, .food-dot');
    if (!this.draggedElement) return;

    const rect = this.draggedElement.getBoundingClientRect();
    this.offset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  drag(e) {
    if (!this.draggedElement) return;
    
    e.preventDefault();
    const x = e.clientX - this.offset.x;
    const y = e.clientY - this.offset.y;
    
    // Keep within main room bounds
    const mainRoom = document.getElementById('main-room');
    const roomRect = mainRoom.getBoundingClientRect();
    const elementRect = this.draggedElement.getBoundingClientRect();
    
    const boundedX = Math.max(roomRect.left, Math.min(x, roomRect.right - elementRect.width));
    const boundedY = Math.max(roomRect.top, Math.min(y, roomRect.bottom - elementRect.height));
    
    this.draggedElement.style.left = `${boundedX}px`;
    this.draggedElement.style.top = `${boundedY}px`;
  }

  stopDragging() {
    if (!this.draggedElement) return;
    
    const rect = this.draggedElement.getBoundingClientRect();
    const event = new CustomEvent('dragend', { 
      detail: { rect }
    });
    this.draggedElement.dispatchEvent(event);
    this.draggedElement = null;
  }
}