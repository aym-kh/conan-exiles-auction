import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnInit, output, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { FilePondFile } from 'filepond';
import { Auction } from '../../services/auction';
import { SupabaseService } from '../../services/supabase';
import {
  IAuction,
  IAuctionCurrency,
  IAuctionImage,
  IAuctionImageUpload,
  ICreateAuctionPayload,
  TBidVisibility,
} from '../../types';
import {
  AUCTION_CURRENCIES,
  AUCTION_IMAGE_ALLOWED_TYPES,
  AUCTION_IMAGE_MAX_COUNT,
  AUCTION_IMAGE_MAX_SIZE_LABEL,
  AUCTION_IMAGE_MAX_SIZE_BYTES,
  MULTI_ITEM_AUCTION_TITLE,
} from '../../const';
import { AuctionImageUploader } from '../auction-image-uploader/auction-image-uploader';

type AuctionItemFormGroup = FormGroup<{
  id: FormControl<string | undefined>;
  imageKey: FormControl<string>;
  title: FormControl<string>;
  description: FormControl<string>;
}>;

@Component({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AuctionImageUploader,
  ],
  selector: 'app-auction-form',
  templateUrl: './auction-form.html',
})
export class AuctionForm implements OnInit {

  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly auctionService = inject(Auction);
  private readonly supabaseService = inject(SupabaseService);

  @Input({ required: true }) guildId!: string;
  @Input() auction: IAuction | null = null;

  auctionCreated = output<void>();
  auctionUpdated = output<void>();
  closeModal = output<void>();
  isSubmitting = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  bidVisibilityLocked = signal(false);
  isCheckingBidVisibilityLock = signal(false);
  isLoadingImages = signal(false);
  imageLoadError = signal<string | null>(null);
  readonly auctionCurrencyOptions = AUCTION_CURRENCIES;
  readonly maxAuctionImages = AUCTION_IMAGE_MAX_COUNT;
  readonly maxImageSizeLabel = AUCTION_IMAGE_MAX_SIZE_LABEL.replace('MB', ' MB');
  protected readonly auctionImages = signal<IAuctionImage[]>([]);
  protected readonly imageFiles = signal<Record<string, FilePondFile[]>>({});
  protected readonly removedImageIds = signal<Set<string>>(new Set());
  private readonly auctionImageKey = 'auction';
  private nextItemImageKey = 0;
  private createdAuction: IAuction | null = null;
  // Default end time: 24 hours from now (formatted for datetime-local input)
  private defaultEndTime(): string {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 16);
  }

  form = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    bid_visibility: this.fb.control<TBidVisibility>('open', [Validators.required]),
    has_multiple_items: [false],
    items: this.fb.array<AuctionItemFormGroup>([]),
    currencies: this.fb.array([this.createCurrencyGroup()]),
    end_time: [this.defaultEndTime(), [Validators.required]],
  });

  async ngOnInit() {
    if (!this.auction) {
      return;
    }

    this.form.patchValue({
      title: this.auction.title,
      description: this.auction.description ?? '',
      bid_visibility: this.auction.bid_visibility,
      has_multiple_items: !!this.auction.items?.length,
      end_time: this.toLocalDateTimeInput(this.auction.end_time),
    });

    for (const item of this.auction.items ?? []) {
      this.itemControls.push(this.createItemGroup(item.id, item.title, item.description ?? ''));
    }

    this.currencyControls.clear();
    for (const currency of this.auction.currencies) {
      this.currencyControls.push(this.fb.group({
        symbol: [currency.symbol, [Validators.required]],
        weight: [currency.weight, [Validators.required, Validators.min(1)]],
      }));
    }

    this.isLoadingImages.set(true);
    try {
      this.auctionImages.set(await this.auctionService.getAuctionImages(this.auction.id));
    } catch (error) {
      console.error(`Failed to load images for auction ${this.auction.id}:`, error);
      this.imageLoadError.set('Could not load existing auction images. Close and reopen the editor to try again.');
    } finally {
      this.isLoadingImages.set(false);
    }

    this.isCheckingBidVisibilityLock.set(true);
    this.form.controls.bid_visibility.disable();
    try {
      const isLocked = await this.auctionService.isBidVisibilityLocked(this.auction.id);
      this.bidVisibilityLocked.set(isLocked);
      if (!isLocked) {
        this.form.controls.bid_visibility.enable();
      }
    } catch (error) {
      console.error(`Failed to check bidding format lock for auction ${this.auction.id}:`, error);
      this.bidVisibilityLocked.set(true);
      this.errorMessage.set('Could not verify whether bidding format is locked. The format is disabled for safety.');
    } finally {
      this.isCheckingBidVisibilityLock.set(false);
    }
  }

  private toLocalDateTimeInput(value: string): string {
    const date = new Date(value);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  get currencyControls(): FormArray {
    return this.form.controls.currencies;
  }

  get itemControls(): FormArray<AuctionItemFormGroup> {
    return this.form.controls.items;
  }

  get isMultiItemAuction(): boolean {
    return this.form.controls.has_multiple_items.value;
  }

  get auctionModeLocked(): boolean {
    return !!this.auction || !!this.createdAuction || this.isSubmitting();
  }

  get hasTooFewItems(): boolean {
    return this.isMultiItemAuction && this.itemControls.length < 2;
  }

  private createCurrencyGroup() {
    return this.fb.group({
      symbol: ['', [Validators.required]],
      weight: [1, [Validators.required, Validators.min(1)]],
    });
  }

  addCurrency() {
    this.currencyControls.push(this.createCurrencyGroup());
  }

  removeCurrency(index: number) {
    if (this.currencyControls.length > 1) {
      this.currencyControls.removeAt(index);
    }
  }

  onMultiItemChange(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    this.form.controls.has_multiple_items.setValue(target.checked);
    if (target.checked) {
      this.form.controls.title.clearValidators();
      this.form.controls.title.updateValueAndValidity();
      if (this.itemControls.length === 0) {
        this.addItem();
        this.addItem();
      }
      return;
    }

    this.form.controls.title.setValidators([Validators.required, Validators.minLength(3)]);
    this.form.controls.title.updateValueAndValidity();
    this.itemControls.clear();
  }

  private createItemGroup(id: string | undefined, title: string, description: string): AuctionItemFormGroup {
    return this.fb.group({
      id: [id],
      imageKey: [id ?? `new-item-${this.nextItemImageKey++}`],
      title: [title, [Validators.required, Validators.minLength(3)]],
      description: [description],
    });
  }

  addItem() {
    this.itemControls.push(this.createItemGroup(undefined, '', ''));
  }

  removeItem(index: number) {
    if (this.itemControls.length > 2) {
      this.itemControls.removeAt(index);
    }
  }

  protected onImageFilesChanged(files: FilePondFile[], imageKey: string) {
    this.errorMessage.set(null);
    const updatedFiles = { ...this.imageFiles() };
    if (files.length > 0) {
      updatedFiles[imageKey] = files;
    } else {
      delete updatedFiles[imageKey];
    }
    this.imageFiles.set(updatedFiles);
  }

  protected existingImagesFor(itemId: string | null): IAuctionImage[] {
    const removed = this.removedImageIds();
    return this.auctionImages().filter((image) => image.item_id === itemId && !removed.has(image.id));
  }

  protected removeExistingImage(imageId: string) {
    this.errorMessage.set(null);
    this.removedImageIds.set(new Set([...this.removedImageIds(), imageId]));
  }

  protected imageCount(imageKey: string, itemId: string | null): number {
    return this.existingImagesFor(itemId).length + (this.imageFiles()[imageKey]?.length ?? 0);
  }

  protected imageLimitExceeded(): boolean {
    if (this.isMultiItemAuction) {
      return this.itemControls.controls.some((item) =>
        this.imageCount(item.controls.imageKey.value, item.controls.id.value ?? null) > AUCTION_IMAGE_MAX_COUNT,
      );
    }
    return this.imageCount(this.auctionImageKey, null) > AUCTION_IMAGE_MAX_COUNT;
  }

  private getImageValidationError(): string | null {
    if (this.isLoadingImages()) {
      return 'Wait for existing auction images to finish loading.';
    }
    if (this.imageLoadError()) {
      return this.imageLoadError();
    }
    if (this.imageLimitExceeded()) {
      return `Each item can have up to ${AUCTION_IMAGE_MAX_COUNT} images. Remove an image before adding another.`;
    }

    const imageKeys = this.isMultiItemAuction
      ? this.itemControls.controls.map((item) => item.controls.imageKey.value)
      : [this.auctionImageKey];
    for (const imageKey of imageKeys) {
      for (const pondFile of this.imageFiles()[imageKey] ?? []) {
        if (!AUCTION_IMAGE_ALLOWED_TYPES.some((type) => type === pondFile.fileType)) {
          return 'Images must be JPEG, PNG, or WebP files.';
        }
        if (pondFile.fileSize > AUCTION_IMAGE_MAX_SIZE_BYTES) {
          return `Each image must be ${this.maxImageSizeLabel} or smaller.`;
        }
      }
    }
    return null;
  }

  private getRetainedImageIds(auction: IAuction): string[] {
    const removed = this.removedImageIds();
    const itemIds = new Set((auction.items ?? []).map((item) => item.id));
    return this.auctionImages()
      .filter((image) =>
        !removed.has(image.id)
        && (itemIds.size > 0 ? image.item_id !== null && itemIds.has(image.item_id) : image.item_id === null),
      )
      .map((image) => image.id);
  }

  private getImageUploads(auction: IAuction): IAuctionImageUpload[] {
    if (!this.isMultiItemAuction) {
      return (this.imageFiles()[this.auctionImageKey] ?? []).map((pondFile) => ({
        item_id: null,
        file: pondFile.file,
      }));
    }

    return this.itemControls.controls.flatMap((item, index) => {
      const itemId = auction.items?.[index]?.id;
      if (!itemId) {
        throw new Error('Could not determine which auction item an image belongs to.');
      }
      return (this.imageFiles()[item.controls.imageKey.value] ?? []).map((pondFile) => ({
        item_id: itemId,
        file: pondFile.file,
      }));
    });
  }

  private updateItemIds(auction: IAuction) {
    for (const [index, item] of this.itemControls.controls.entries()) {
      const savedItem = auction.items?.[index];
      if (savedItem) {
        item.controls.id.setValue(savedItem.id);
      }
    }
  }

  async onSubmit() {
    if (this.form.invalid || this.hasTooFewItems) {
      this.form.markAllAsTouched();
      this.itemControls.markAllAsTouched();
      return;
    }

    const imageValidationError = this.getImageValidationError();
    if (imageValidationError) {
      this.errorMessage.set(imageValidationError);
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    try {
      const currentUser = await this.supabaseService.getCurrentUser();
      if (!currentUser) {
        throw new Error('User authentication session not found.');
      }

      const formValues = this.form.getRawValue();

      const currencies: IAuctionCurrency[] = formValues.currencies.map((currency) => ({
        symbol: currency.symbol.trim(),
        weight: currency.weight,
      }));

      const auctionFields = {
        title: this.isMultiItemAuction ? MULTI_ITEM_AUCTION_TITLE : formValues.title.trim(),
        description: this.isMultiItemAuction ? null : formValues.description.trim() || null,
        bid_visibility: formValues.bid_visibility,
        currencies,
        end_time: new Date(formValues.end_time).toISOString(),
        ...(this.isMultiItemAuction ? {
          items: formValues.items.map((item) => ({
            ...(item.id ? { id: item.id } : {}),
            title: item.title.trim(),
            description: item.description.trim() || null,
          })),
        } : {}),
      };

      const isEditMode = !!this.auction;
      let savedAuction: IAuction;
      const existingAuction = this.auction ?? this.createdAuction;
      if (existingAuction) {
        savedAuction = await this.auctionService.updateAuction(existingAuction.id, auctionFields, currentUser.id);
      } else {
        const payload: ICreateAuctionPayload = {
          guild_id: this.guildId,
          ...auctionFields,
        };
        savedAuction = await this.auctionService.createAuction(payload, currentUser.id);
        this.createdAuction = savedAuction;
      }

      this.updateItemIds(savedAuction);
      await this.auctionService.syncAuctionImages(
        savedAuction.id,
        this.auctionImages(),
        this.getRetainedImageIds(savedAuction),
        this.getImageUploads(savedAuction),
      );

      if (isEditMode) {
        this.auctionUpdated.emit();
      } else {
        this.auctionCreated.emit();
      }
    } catch (err) {
      console.error('Failed to create auction:', err);
      this.errorMessage.set(
        this.createdAuction && !this.auction
          ? 'The auction was saved, but its images could not be synced. Retry saving or cancel to keep the auction without images.'
          : err instanceof Error ? err.message : 'Failed to save auction. Please try again.',
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  cancel() {
    if (this.createdAuction && !this.auction) {
      this.auctionCreated.emit();
    }
    this.closeModal.emit();
  }
}
