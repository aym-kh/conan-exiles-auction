import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { FilePondFile, FilePondOptions } from 'filepond';
import { Auction } from '../../services/auction';
import { AuctionImageUploader } from './auction-image-uploader';

@Component({
  selector: 'file-pond',
  standalone: true,
  template: '',
})
class FilePondStub {
  @Input() options!: FilePondOptions;
  @Output() onupdatefiles = new EventEmitter<{ items: FilePondFile[] }>();
}

describe('AuctionImageUploader', () => {
  let fixture: ComponentFixture<AuctionImageUploader>;
  let auctionService: {
    uploadStagedAuctionImage: ReturnType<typeof vi.fn>;
    removeStagedAuctionImage: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    auctionService = {
      uploadStagedAuctionImage: vi.fn().mockResolvedValue('user-id/123e4567-e89b-12d3-a456-426614174000.png'),
      removeStagedAuctionImage: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [AuctionImageUploader],
      providers: [{ provide: Auction, useValue: auctionService }],
    })
      .overrideComponent(AuctionImageUploader, { set: { imports: [FilePondStub] } })
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

  it('passes the configured process handler to FilePond', () => {
    const pond = fixture.debugElement.query(By.directive(FilePondStub)).componentInstance as FilePondStub;

    expect(pond.options.allowProcess).toBe(true);
    expect(typeof pond.options.server).toBe('object');
    expect(pond.options.server && typeof pond.options.server !== 'string'
      ? typeof pond.options.server.process
      : 'missing').toBe('function');
  });

  it('uploads through FilePond’s process action and returns the staged path', async () => {
    const server = fixture.componentInstance.options().server;
    if (!server || typeof server === 'string' || typeof server.process !== 'function') {
      throw new Error('Expected a custom FilePond process handler.');
    }

    const file = new File(['image'], 'image.png', { type: 'image/png' });
    const load = vi.fn();
    const error = vi.fn();
    const progress = vi.fn();
    server.process(
      'image',
      file,
      {},
      load,
      error,
      progress,
      vi.fn(),
      vi.fn(),
      {
        chunkTransferId: '',
        chunkServer: { url: '' },
        chunkUploads: false,
        chunkForce: false,
        chunkSize: 0,
        chunkRetryDelays: [],
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(auctionService.uploadStagedAuctionImage).toHaveBeenCalledWith(file);
    expect(progress).toHaveBeenCalledWith(true, file.size, file.size);
    expect(load).toHaveBeenCalledWith('user-id/123e4567-e89b-12d3-a456-426614174000.png');
    expect(error).not.toHaveBeenCalled();
  });
});
