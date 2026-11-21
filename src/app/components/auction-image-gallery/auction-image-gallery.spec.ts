import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IAuctionImage } from '../../types';
import { AuctionImageGallery } from './auction-image-gallery';

describe('AuctionImageGallery', () => {
  let fixture: ComponentFixture<AuctionImageGallery>;

  const images: IAuctionImage[] = [
    {
      id: 'image-1',
      auction_id: 'auction-1',
      item_id: null,
      storage_path: 'auction-1/auction/image-1.jpg',
      sort_order: 0,
      created_at: '2026-11-21T00:00:00.000Z',
      public_url: 'https://example.test/image-1.jpg',
    },
    {
      id: 'image-2',
      auction_id: 'auction-1',
      item_id: null,
      storage_path: 'auction-1/auction/image-2.jpg',
      sort_order: 1,
      created_at: '2026-11-21T00:01:00.000Z',
      public_url: 'https://example.test/image-2.jpg',
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuctionImageGallery],
    }).compileComponents();

    fixture = TestBed.createComponent(AuctionImageGallery);
    fixture.componentRef.setInput('images', images);
    fixture.componentRef.setInput('imageAlt', 'Sword of Crom');
    fixture.detectChanges();
  });

  it('shows the selected image and changes it from the thumbnail strip', () => {
    const mainImage = fixture.nativeElement.querySelector('.gallery-main img') as HTMLImageElement;
    expect(mainImage.getAttribute('src')).toBe(images[0].public_url);
    expect(mainImage.alt).toBe('Sword of Crom');

    const thumbnails = fixture.nativeElement.querySelectorAll('.gallery-thumbnail') as NodeListOf<HTMLButtonElement>;
    expect(thumbnails.length).toBe(2);
    thumbnails[1].click();
    fixture.detectChanges();

    expect(mainImage.getAttribute('src')).toBe(images[1].public_url);
    expect(thumbnails[1].getAttribute('aria-pressed')).toBe('true');
  });
});
