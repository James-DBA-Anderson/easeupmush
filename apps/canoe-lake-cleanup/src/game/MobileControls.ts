interface TouchState {
  identifier: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export class MobileControls {
  private joystickContainer: HTMLElement;
  private joystickKnob: HTMLElement;
  private sprayButton: HTMLElement;
  
  private moveX = 0;
  private moveY = 0;
  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private isSpraying = false;
  
  private joystickTouch: TouchState | null = null;
  private lookTouch: TouchState | null = null;
  
  private joystickMaxDistance = 50;
  private lookSensitivity = 0.003;
  
  private isActive = false;

  constructor() {
    this.joystickContainer = document.getElementById('joystick-container')!;
    this.joystickKnob = document.getElementById('joystick-knob')!;
    this.sprayButton = document.getElementById('spray-button')!;
    
    this.setupEventListeners();
    this.checkIfMobile();
  }

  private checkIfMobile(): void {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    this.isActive = isMobile || isTouchDevice;
    
    if (this.isActive) {
      this.joystickContainer.style.display = 'block';
      this.sprayButton.style.display = 'block';
    }
  }

  private setupEventListeners(): void {
    document.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    document.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    document.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    document.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
  }

  private onTouchStart(event: TouchEvent): void {
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      const x = touch.clientX;
      const y = touch.clientY;
      
      if (this.isInsideElement(x, y, this.sprayButton)) {
        this.isSpraying = true;
        this.sprayButton.classList.add('active');
        event.preventDefault();
      }
      else if (this.isInsideElement(x, y, this.joystickContainer) && !this.joystickTouch) {
        this.joystickTouch = {
          identifier: touch.identifier,
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
        };
        this.joystickContainer.classList.add('active');
        event.preventDefault();
      }
      else if (x > window.innerWidth / 2 && !this.lookTouch) {
        this.lookTouch = {
          identifier: touch.identifier,
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
        };
        event.preventDefault();
      }
    }
  }

  private onTouchMove(event: TouchEvent): void {
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      
      if (this.joystickTouch && touch.identifier === this.joystickTouch.identifier) {
        this.joystickTouch.currentX = touch.clientX;
        this.joystickTouch.currentY = touch.clientY;
        
        const deltaX = this.joystickTouch.currentX - this.joystickTouch.startX;
        const deltaY = this.joystickTouch.currentY - this.joystickTouch.startY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        if (distance > this.joystickMaxDistance) {
          const angle = Math.atan2(deltaY, deltaX);
          this.joystickTouch.currentX = this.joystickTouch.startX + Math.cos(angle) * this.joystickMaxDistance;
          this.joystickTouch.currentY = this.joystickTouch.startY + Math.sin(angle) * this.joystickMaxDistance;
        }
        
        this.moveX = (this.joystickTouch.currentX - this.joystickTouch.startX) / this.joystickMaxDistance;
        this.moveY = (this.joystickTouch.currentY - this.joystickTouch.startY) / this.joystickMaxDistance;
        
        const knobX = this.joystickTouch.currentX - this.joystickTouch.startX;
        const knobY = this.joystickTouch.currentY - this.joystickTouch.startY;
        this.joystickKnob.style.transform = `translate(-50%, -50%) translate(${knobX}px, ${knobY}px)`;
        
        event.preventDefault();
      }
      
      if (this.lookTouch && touch.identifier === this.lookTouch.identifier) {
        const deltaX = touch.clientX - this.lookTouch.currentX;
        const deltaY = touch.clientY - this.lookTouch.currentY;
        
        this.lookDeltaX = deltaX * this.lookSensitivity;
        this.lookDeltaY = deltaY * this.lookSensitivity;
        
        this.lookTouch.currentX = touch.clientX;
        this.lookTouch.currentY = touch.clientY;
        
        event.preventDefault();
      }
    }
  }

  private onTouchEnd(event: TouchEvent): void {
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      
      if (this.joystickTouch && touch.identifier === this.joystickTouch.identifier) {
        this.joystickTouch = null;
        this.moveX = 0;
        this.moveY = 0;
        this.joystickKnob.style.transform = 'translate(-50%, -50%)';
        this.joystickContainer.classList.remove('active');
      }
      
      if (this.lookTouch && touch.identifier === this.lookTouch.identifier) {
        this.lookTouch = null;
      }
      
      if (this.isInsideElement(touch.clientX, touch.clientY, this.sprayButton)) {
        this.isSpraying = false;
        this.sprayButton.classList.remove('active');
      }
    }
  }

  private isInsideElement(x: number, y: number, element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  public getMoveInput(): { x: number; y: number } {
    return { x: this.moveX, y: this.moveY };
  }

  public getLookDelta(): { x: number; y: number } {
    const delta = { x: this.lookDeltaX, y: this.lookDeltaY };
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    return delta;
  }

  public getIsSpraying(): boolean {
    return this.isSpraying;
  }

  public isEnabled(): boolean {
    return this.isActive;
  }
}
