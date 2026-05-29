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
  modal?: boolean;
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
  private dragDeltaY = 0;
  private dragCleanup: (() => void) | null = null;
  private viewportFrame: number | null = null;
  private readonly onViewportChange = () => {
    if (!this.isOpen) return;

    if (this.viewportFrame !== null) {
      window.cancelAnimationFrame(this.viewportFrame);
    }

    this.viewportFrame = window.requestAnimationFrame(() => {
      this.viewportFrame = null;
      this.snapTo(this.currentSnap);
    });
  };

  constructor(options: BottomSheetOptions = {}) {
    this.options = {
      snap: 'half',
      snapPoints: [0.22, 0.56, 0.94],
      dismissible: true,
      modal: true,
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
      border-t-2 border-[#2c2a27] overflow-hidden
    `;
    this.el.style.transform = 'translateY(100%)';
    this.el.dataset.component = 'bottom-sheet';

    // Safe area padding
    this.el.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
    this.el.style.overscrollBehavior = 'contain';
    this.el.style.willChange = 'transform';

    // Handle + header
    const header = document.createElement('div');
    header.className = 'flex flex-col items-center pt-2 pb-1 touch-none select-none shrink-0';

    if (this.options.showHandle) {
      const handle = document.createElement('div');
      handle.className = 'w-10 h-1.5 bg-[#8a8178]/40 rounded-full mb-2';
      header.appendChild(handle);
    }

    if (this.options.title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'font-semibold px-14 text-lg mb-2 text-[#111] dark:text-white text-center leading-tight';
      titleEl.textContent = this.options.title;
      header.appendChild(titleEl);
    }

    // Content area
    this.content = document.createElement('div');
    this.content.dataset.component = 'bottom-sheet-content';
    this.content.className = 'px-4 pb-6 overflow-auto flex-1 text-sm text-[#111] dark:text-[#f4f1e9] leading-relaxed overscroll-contain';
    this.content.style.touchAction = 'pan-y';
    this.content.style.setProperty('-webkit-overflow-scrolling', 'touch');

    // Close button (top right)
    if (this.options.dismissible) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'absolute top-2.5 right-3 min-h-11 min-w-11 rounded-full text-2xl leading-none text-[#2c2a27] dark:text-white hover:text-[#8a8178] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a8178]';
      closeBtn.setAttribute('aria-label', 'Close details');
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

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      startY = e.clientY;
      this.dragDeltaY = 0;
      this.el.style.transition = 'none';
      handle.setPointerCapture?.(e.pointerId);
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp, { once: true });
    };

    const onPointerMove = (e: PointerEvent) => {
      this.dragDeltaY = Math.max(0, e.clientY - startY);
      this.el.style.transform = `translateY(${this.dragDeltaY}px)`;
    };

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      this.el.style.transition = 'transform 200ms ease-out';

      const threshold = this.getViewportHeight() * 0.18;
      if (this.dragDeltaY > threshold && this.options.dismissible) {
        this.close();
      } else {
        this.snapTo(this.currentSnap);
      }

      this.dragDeltaY = 0;
    };

    handle.addEventListener('pointerdown', onPointerDown);
    this.dragCleanup = () => {
      handle.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
    };
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
    const vh = this.getViewportHeight();

    // snapPoints represent the fraction of viewport the sheet should occupy from the bottom
    let fraction: number;
    if (snap === 'peek') fraction = this.options.snapPoints?.[0] || 0.22;
    else if (snap === 'half') fraction = this.options.snapPoints?.[1] || 0.56;
    else fraction = this.options.snapPoints?.[2] || 0.94;

    // Snap points define how much viewport height the sheet occupies.
    const requestedHeight = Math.round(vh * fraction);
    const minHeight = snap === 'peek' ? Math.min(220, Math.round(vh * 0.34)) : Math.min(320, Math.round(vh * 0.7));
    const maxHeight = this.getMaxSheetHeight();
    const height = Math.max(120, Math.min(maxHeight, Math.max(minHeight, requestedHeight)));

    this.el.style.maxHeight = `${maxHeight}px`;
    this.el.style.height = `${height}px`;
    this.el.style.transform = 'translateY(0px)';
  }

  open(initialSnap: SheetSnap = 'half') {
    if (this.isOpen) return;
    this.isOpen = true;

    if (this.options.modal) {
      document.body.appendChild(this.backdrop);
    }
    document.body.appendChild(this.el);
    this.bindViewportListeners();

    // Force reflow then animate in
    requestAnimationFrame(() => {
      if (this.options.modal) {
        this.backdrop.style.transition = 'opacity 150ms ease';
        this.backdrop.style.opacity = '1';
        this.backdrop.style.pointerEvents = 'auto';
      }
      this.snapTo(initialSnap);
    });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.unbindViewportListeners();

    this.el.style.transition = 'transform 200ms ease-in';
    this.el.style.transform = 'translateY(100%)';

    if (this.options.modal) {
      this.backdrop.style.transition = 'opacity 150ms ease';
      this.backdrop.style.opacity = '0';
      this.backdrop.style.pointerEvents = 'none';
    }

    setTimeout(() => {
      this.backdrop.remove();
      this.el.remove();
      this.dragCleanup?.();
      this.dragCleanup = null;
      this.options.onClose?.();
    }, 220);
  }

  private getViewportHeight() {
    return Math.max(320, Math.round(window.visualViewport?.height || window.innerHeight));
  }

  private getMaxSheetHeight() {
    const vh = this.getViewportHeight();
    const topGuard = window.innerWidth < 768 ? 88 : 72;
    return Math.max(220, vh - topGuard);
  }

  private bindViewportListeners() {
    window.addEventListener('resize', this.onViewportChange);
    window.addEventListener('orientationchange', this.onViewportChange);
    window.visualViewport?.addEventListener('resize', this.onViewportChange);
    window.visualViewport?.addEventListener('scroll', this.onViewportChange);
  }

  private unbindViewportListeners() {
    window.removeEventListener('resize', this.onViewportChange);
    window.removeEventListener('orientationchange', this.onViewportChange);
    window.visualViewport?.removeEventListener('resize', this.onViewportChange);
    window.visualViewport?.removeEventListener('scroll', this.onViewportChange);

    if (this.viewportFrame !== null) {
      window.cancelAnimationFrame(this.viewportFrame);
      this.viewportFrame = null;
    }
  }
}
