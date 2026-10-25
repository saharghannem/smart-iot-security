import { Component, Inject, ViewChild, ElementRef, AfterViewInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';

@Component({
  selector: 'app-image-cropper-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatSliderModule],
  templateUrl: './image-cropper-dialog.component.html',
  styleUrl: './image-cropper-dialog.component.css'
})
export class ImageCropperDialogComponent implements AfterViewInit {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  
  private ctx: CanvasRenderingContext2D | null = null;
  private image = new Image();
  
  // State
  private imgX = 0;
  private imgY = 0;
  private defaultScale = 1;
  public scale = 1;
  
  // Dragging state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  
  // Constants
  public CW = 400; // Canvas Width
  public CH = 400; // Canvas Height
  private CROP_SIZE = 250; // Size of the crop circle/square

  constructor(
    public dialogRef: MatDialogRef<ImageCropperDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { imageUrl: string },
    private ngZone: NgZone
  ) {}

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d');
    
    this.image.onload = () => {
      // Fit to cover crop area initially
      const scaleX = this.CROP_SIZE / this.image.width;
      const scaleY = this.CROP_SIZE / this.image.height;
      this.defaultScale = Math.max(scaleX, scaleY);
      this.scale = this.defaultScale;
      
      this.imgX = this.CW / 2;
      this.imgY = this.CH / 2;
      
      this.draw();
    };
    this.image.src = this.data.imageUrl;
    
    // Setup drag events
    canvas.addEventListener('mousedown', this.onDragStart.bind(this));
    window.addEventListener('mousemove', this.onDragMove.bind(this));
    window.addEventListener('mouseup', this.onDragEnd.bind(this));
    
    // Touch support
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); this.onDragStart(e.touches[0]); }, { passive: false });
    window.addEventListener('touchmove', (e) => this.onDragMove(e.touches[0]), { passive: false });
    window.addEventListener('touchend', this.onDragEnd.bind(this));
  }

  onZoomChange(event: Event): void {
    const slider = event.target as HTMLInputElement;
    this.scale = parseFloat(slider.value);
    this.draw();
  }

  private onDragStart(e: MouseEvent | Touch): void {
    this.isDragging = true;
    this.dragStartX = e.clientX - this.imgX;
    this.dragStartY = e.clientY - this.imgY;
  }

  private onDragMove(e: MouseEvent | Touch): void {
    if (!this.isDragging) return;
    this.ngZone.runOutsideAngular(() => {
      this.imgX = e.clientX - this.dragStartX;
      this.imgY = e.clientY - this.dragStartY;
      this.draw();
    });
  }

  private onDragEnd(): void {
    this.isDragging = false;
  }

  private draw(): void {
    if (!this.ctx) return;
    
    // Clear
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(0, 0, this.CW, this.CH);
    
    // Draw Image (Centered around imgX, imgY)
    this.ctx.save();
    this.ctx.translate(this.imgX, this.imgY);
    this.ctx.scale(this.scale, this.scale);
    this.ctx.drawImage(this.image, -this.image.width / 2, -this.image.height / 2);
    this.ctx.restore();
    
    // Draw Overlay (darken outside crop area)
    this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this.ctx.beginPath();
    this.ctx.rect(0, 0, this.CW, this.CH);
    this.ctx.arc(this.CW / 2, this.CH / 2, this.CROP_SIZE / 2, 0, Math.PI * 2, true);
    this.ctx.fill('evenodd');
    
    // Draw border
    this.ctx.strokeStyle = '#2563eb';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(this.CW / 2, this.CH / 2, this.CROP_SIZE / 2, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  crop(): void {
    // Hidden canvas for actual extraction
    const hiddenCanvas = document.createElement('canvas');
    hiddenCanvas.width = this.CROP_SIZE;
    hiddenCanvas.height = this.CROP_SIZE;
    const hctx = hiddenCanvas.getContext('2d')!;
    
    hctx.save();
    // Move center to middle, then translate by the offset of exactly where the image was, minus center of crop
    hctx.translate(this.CROP_SIZE / 2, this.CROP_SIZE / 2);
    
    // Add the user pan offset
    const offsetX = this.imgX - (this.CW / 2);
    const offsetY = this.imgY - (this.CH / 2);
    hctx.translate(offsetX, offsetY);
    hctx.scale(this.scale, this.scale);
    
    hctx.drawImage(this.image, -this.image.width / 2, -this.image.height / 2);
    hctx.restore();

    // Export blob
    hiddenCanvas.toBlob((blob) => {
      if (blob) {
        this.dialogRef.close(blob);
      }
    }, 'image/jpeg', 0.95);
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
