import { Component, computed, ElementRef, input, signal, ViewChild } from '@angular/core';
import { IAuctionImage } from '../../types';

@Component({
  selector: 'app-auction-image-gallery',
  templateUrl: './auction-image-gallery.html',
  styleUrl: './auction-image-gallery.css',
})
export class AuctionImageGallery {
  readonly images = input<IAuctionImage[]>([]);
  readonly imageAlt = input('');
  protected readonly activeIndex = signal(0);
  @ViewChild('lightbox') private lightbox?: ElementRef<HTMLDialogElement>;

  protected readonly currentImage = computed(() => {
    const images = this.images();
    if (images.length === 0) {
      return null;
    }
    return images[Math.min(this.activeIndex(), images.length - 1)];
  });

  protected selectImage(index: number) {
    if (index >= 0 && index < this.images().length) {
      this.activeIndex.set(index);
    }
  }

  protected openLightbox() {
    const dialog = this.lightbox?.nativeElement;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  protected closeLightbox() {
    if (this.lightbox?.nativeElement.open) {
      this.lightbox.nativeElement.close();
    }
  }

  protected showPrevious() {
    const imageCount = this.images().length;
    if (imageCount > 1) {
      this.activeIndex.update((index) => (index - 1 + imageCount) % imageCount);
    }
  }

  protected showNext() {
    const imageCount = this.images().length;
    if (imageCount > 1) {
      this.activeIndex.update((index) => (index + 1) % imageCount);
    }
  }

  protected onLightboxClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.closeLightbox();
    }
  }

  protected onLightboxKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      this.showPrevious();
    } else if (event.key === 'ArrowRight') {
      this.showNext();
    }
  }
}
