import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { FilePondFile } from 'filepond';
import { AuctionImageUploader } from './auction-image-uploader';

describe('AuctionImageUploader', () => {
  let fixture: ComponentFixture<AuctionImageUploader>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuctionImageUploader],
    })
      .overrideComponent(AuctionImageUploader, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(AuctionImageUploader);
    fixture.detectChanges();
  });

  it('emits the file list from the FilePond update event', () => {
    const files: FilePondFile[] = [];
    let emittedFiles: FilePondFile[] | undefined;
    fixture.componentInstance.filesChange.subscribe((value) => emittedFiles = value);

    fixture.componentInstance.onFilesChanged({ items: files });

    expect(emittedFiles).toBe(files);
  });
});
