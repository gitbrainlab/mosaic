/**
 * BottomSheet — Core mobile primitive
 * Designed per the PWA research: primary detail surface on mobile.
 * Supports snap points, focus management, safe areas, and good touch behavior.
 */

export type SheetSnap = 'peek' | 'half' | 'full';

interface BottomSheetOptions {
  title?: string;
  snap?: SheetSnap;
  snapPoints?: number[]; // e.g. [0.22, 0.56, 0.94] as fractions of viewport height
  dismissible?: boolean;
  showHandle?: boolean;
  onClose?: () => void;
}

export class BottomSheet {
  private el: HTMLDivElement;
  private backdrop: HTMLDivElement;
  private content: HTMLDivElement;
  private isOpen = false;
  private currentSnap: SheetSnap = 'half';
  private options: BottomSheetOptions;

  constructor(options: BottomSheetOptions = {}) {
    this.options = {
      snap: 'half',
      snapPoints: [0.22, 0.56, 0.94],
      dismissible: true,
      showHandle: true,
      ...options
    };
    this.currentSnap = this.options.snap!;

    // Backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'fixed inset-0 bg-black/50 z-[290] opacity-0 transition-opacity pointer-events-none';
    this.backdrop.addEventListener('click', () => {
      if (this.options.dismissible) this.close();
    });

    // Sheet
    this.el = document.createElement('div');
    this.el.className = `
      fixed bottom-0 left-0 right-0 z-[300] bg-white dark:bg-[#1a1916] 
      rounded-t-2xl shadow-2xl flex flex-col
      transition-transform duration-200 ease-out
      max-h-[94vh] border-t-2 border-[#2c2a27]
    `;
    this.el.style.transform = 'translateY(100%)';

    // Safe area padding
    this.el.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';

    // Handle + header
    const header = document.createElement('div');
    header.className = 'flex flex-col items-center pt-2 pb-1 touch-none select-none';

    if (this.options.showHandle) {
      const handle = document.createElement('div');
      handle.className = 'w-10 h-1.5 bg-[#8a8178]/40 rounded-full mb-2';
      header.appendChild(handle);
    }

    if (this.options.title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'font-semibold px-4 text-lg mb-2 text-[#111] dark:text-white';
      titleEl.textContent = this.options.title;
      header.appendChild(titleEl);
    }

    // Content area
    this.content = document.createElement('div');
    this.content.className = 'px-4 pb-6 overflow-auto flex-1 text-sm text-[#111] dark:text-[#f4f1e9] leading-relaxed';

    // Close button (top right)
    if (this.options.dismissible) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'absolute top-3 right-4 text-2xl leading-none text-[#2c2a27] dark:text-white hover:text-[#8a8178]';
      closeBtn.innerHTML = '&times;';
      closeBtn.addEventListener('click', () => this.close());
      this.el.appendChild(closeBtn);
    }

    this.el.appendChild(header);
    this.el.appendChild(this.content);

    // Drag to dismiss (simple version)
    this.setupDragToClose(header);
  }

  private setupDragToClose(handle: HTMLElement) {
    let startY = 0;
    let startTransform = 0;

    const onPointerDown = (e: PointerEvent) => {
      startY = e.clientY;
      startTransform = this.el.getBoundingClientRect().y;
      this.el.style.transition = 'none';
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp, { once: true });
    };

    const onPointerMove = (e: PointerEvent) => {
      const delta = e.clientY - startY;
      const newY = Math.max(0, startTransform + delta);
      this.el.style.transform = `translateY(${newY}px)`;
    };

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      this.el.style.transition = 'transform 200ms ease-out';

      const currentY = this.el.getBoundingClientRect().y;
      const threshold = window.innerHeight * 0.3;

      if (currentY > threshold && this.options.dismissible) {
        this.close();
      } else {
        this.snapTo(this.currentSnap);
      }
    };

    handle.addEventListener('pointerdown', onPointerDown);
  }

  setContent(html: string | HTMLElement) {
    this.content.innerHTML = '';
    if (typeof html === 'string') {
      this.content.innerHTML = html;
    } else {
      this.content.appendChild(html);
    }
  }

  snapTo(snap: SheetSnap) {
    this.currentSnap = snap;
    const vh = window.innerHeight;

    // snapPoints represent the fraction of viewport the sheet should occupy from the bottom
    let fraction: number;
    if (snap === 'peek') fraction = this.options.snapPoints?.[0] || 0.22;
    else if (snap === 'half') fraction = this.options.snapPoints?.[1] || 0.56;
    else fraction = this.options.snapPoints?.[2] || 0.94;

    // Pull the sheet upward from the bottom
    const targetTranslate = - (vh * fraction);
    this.el.style.transform = `translateY(${targetTranslate}px)`;
  }

  open(initialSnap: SheetSnap = 'half') {
    if (this.isOpen) return;
    this.isOpen = true;

    document.body.appendChild(this.backdrop);
    document.body.appendChild(this.el);

    // Force reflow then animate in
    requestAnimationFrame(() => {
      this.backdrop.style.transition = 'opacity 150ms ease';
      this.backdrop.style.opacity = '1';
      this.backdrop.style.pointerEvents = 'auto';
      this.snapTo(initialSnap);
    });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;

    this.el.style.transition = 'transform 200ms ease-in';
    this.el.style.transform = 'translateY(100%)';

    this.backdrop.style.transition = 'opacity 150ms ease';
    this.backdrop.style.opacity = '0';
    this.backdrop.style.pointerEvents = 'none';

    setTimeout(() => {
      this.backdrop.remove();
      this.el.remove();
      this.options.onClose?.();
    }, 220);
  }
}
