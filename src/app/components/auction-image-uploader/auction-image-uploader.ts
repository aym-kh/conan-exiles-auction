import { Component, computed, inject, input, OnDestroy, output, ViewEncapsulation } from '@angular/core';
import { FilePondFile, FilePondOptions } from 'filepond';
import FilePondPluginFileValidateSize from 'filepond-plugin-file-validate-size';
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type';
import FilePondPluginImagePreview from 'filepond-plugin-image-preview';
import { FilePondModule, registerPlugin } from 'ngx-filepond';
import { Auction } from '../../services/auction';
import {
  AUCTION_IMAGE_ALLOWED_TYPES,
  AUCTION_IMAGE_MAX_COUNT,
  AUCTION_IMAGE_MAX_SIZE_LABEL,
} from '../../const';

const readableImageSize = AUCTION_IMAGE_MAX_SIZE_LABEL.replace('MB', ' MB');

registerPlugin(FilePondPluginImagePreview, FilePondPluginFileValidateType, FilePondPluginFileValidateSize);

@Component({
  imports: [FilePondModule],
  selector: 'app-auction-image-uploader',
  styleUrl: './auction-image-uploader.css',
  template: `
    <div class="auction-image-uploader">
    <file-pond [options]="options()" (onupdatefiles)="onFilesChanged($event)"></file-pond>
    </div>
  `,
  encapsulation: ViewEncapsulation.None,
})
export class AuctionImageUploader implements OnDestroy {
  private readonly auctionService = inject(Auction);
  private readonly stagedPaths = new Set<string>();
  private destroyed = false;

  readonly filesChange = output<FilePondFile[]>();
  readonly disabled = input(false);
  readonly existingCount = input(0);
  private readonly baseOptions: FilePondOptions = {
    allowMultiple: true,
    allowProcess: true,
    allowReorder: true,
    allowImagePreview: true,
    imagePreviewHeight: 120,
    instantUpload: false,
    maxFileSize: AUCTION_IMAGE_MAX_SIZE_LABEL,
    acceptedFileTypes: [...AUCTION_IMAGE_ALLOWED_TYPES],
    labelIdle: 'Drop images here or <span class="filepond--label-action">Browse</span>',
    labelButtonProcessItem: 'Upload image',
    labelFileTypeNotAllowed: 'Only JPEG, PNG, and WebP images are allowed.',
    fileValidateTypeLabelExpectedTypes: 'Use JPEG, PNG, or WebP images.',
    labelMaxFileSizeExceeded: `This image is larger than ${readableImageSize}.`,
    labelMaxFileSize: `Maximum image size is ${readableImageSize}.`,
    server: {
      process: (_fieldName, file, _metadata, load, error, progress, abort) => {
        let aborted = false;
        this.auctionService.uploadStagedAuctionImage(file)
          .then((path) => {
            if (aborted || this.destroyed) {
              this.auctionService.removeStagedAuctionImage(path)
                .catch((cleanupError) => console.error('Could not clean up an aborted staged image upload:', cleanupError));
              return;
            }

            this.stagedPaths.add(path);
            progress(true, file.size, file.size);
            load(path);
          })
          .catch((uploadError: unknown) => {
            if (!aborted && !this.destroyed) {
              console.error('Failed to upload staged auction image:', uploadError);
              error(uploadError instanceof Error ? uploadError.message : 'Failed to upload image.');
            }
          });

        return {
          abort: () => {
            aborted = true;
            abort();
          },
        };
      },
      revert: (serverId, load, error) => {
        if (typeof serverId !== 'string') {
          error('The staged image reference is invalid.');
          return;
        }

        this.auctionService.removeStagedAuctionImage(serverId)
          .then(() => {
            this.stagedPaths.delete(serverId);
            load();
          })
          .catch((removeError: unknown) => {
            console.error('Failed to remove staged auction image:', removeError);
            error(removeError instanceof Error ? removeError.message : 'Failed to remove image.');
          });
      },
    },
  };
  readonly options = computed(() => {
    const remainingSlots = Math.max(0, AUCTION_IMAGE_MAX_COUNT - this.existingCount());
    return {
      ...this.baseOptions,
      maxFiles: Math.max(1, remainingSlots),
      disabled: this.disabled(),
    };
  });

  onFilesChanged(event: { items: FilePondFile[] }) {
    this.filesChange.emit(event.items);
  }

  ngOnDestroy() {
    this.destroyed = true;
    for (const path of this.stagedPaths) {
      this.auctionService.removeStagedAuctionImage(path)
        .catch((error: unknown) => console.error('Could not clean up a staged auction image:', error));
    }
  }
}
