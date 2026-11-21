import { Component, computed, input, output } from '@angular/core';
import { FilePondFile, FilePondOptions } from 'filepond';
import FilePondPluginFileValidateSize from 'filepond-plugin-file-validate-size';
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type';
import FilePondPluginImagePreview from 'filepond-plugin-image-preview';
import { FilePondModule, registerPlugin } from 'ngx-filepond';
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
  template: `
    <file-pond [options]="options" (onupdatefiles)="onFilesChanged($event)"></file-pond>
  `,
})
export class AuctionImageUploader {
  readonly filesChange = output<FilePondFile[]>();
  readonly disabled = input(false);
  private readonly baseOptions: FilePondOptions = {
    allowMultiple: true,
    allowProcess: false,
    allowReorder: true,
    allowImagePreview: true,
    imagePreviewHeight: 120,
    maxFiles: AUCTION_IMAGE_MAX_COUNT,
    maxFileSize: AUCTION_IMAGE_MAX_SIZE_LABEL,
    acceptedFileTypes: [...AUCTION_IMAGE_ALLOWED_TYPES],
    labelIdle: 'Drop images here or <span class="filepond--label-action">Browse</span>',
    labelFileTypeNotAllowed: 'Only JPEG, PNG, and WebP images are allowed.',
    fileValidateTypeLabelExpectedTypes: 'Use JPEG, PNG, or WebP images.',
    labelMaxFileSizeExceeded: `This image is larger than ${readableImageSize}.`,
    labelMaxFileSize: `Maximum image size is ${readableImageSize}.`,
  };
  protected readonly options = computed(() => ({
    ...this.baseOptions,
    disabled: this.disabled(),
  }));

  protected onFilesChanged(files: FilePondFile[]) {
    this.filesChange.emit(files);
  }
}
