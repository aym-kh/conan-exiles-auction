import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnInit, output, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Auction } from '../../services/auction';
import { SupabaseService } from '../../services/supabase';
import { IAuction, IAuctionCurrency, ICreateAuctionPayload } from '../../types';
import { AUCTION_CURRENCIES, MULTI_ITEM_AUCTION_TITLE } from '../../const';

type AuctionItemFormGroup = FormGroup<{
  id: FormControl<string | undefined>;
  title: FormControl<string>;
  description: FormControl<string>;
}>;

@Component({
  imports: [
    CommonModule,
    ReactiveFormsModule,
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
  readonly auctionCurrencyOptions = AUCTION_CURRENCIES;
  // Default end time: 24 hours from now (formatted for datetime-local input)
  private defaultEndTime(): string {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 16);
  }

  form = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    is_blind: [false],
    has_multiple_items: [false],
    items: this.fb.array<AuctionItemFormGroup>([]),
    currencies: this.fb.array([this.createCurrencyGroup()]),
    end_time: [this.defaultEndTime(), [Validators.required]],
  });

  ngOnInit() {
    if (!this.auction) {
      return;
    }

    this.form.patchValue({
      title: this.auction.title,
      description: this.auction.description ?? '',
      is_blind: this.auction.is_blind ?? false,
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

  async onSubmit() {
    if (this.form.invalid || this.hasTooFewItems) {
      this.form.markAllAsTouched();
      this.itemControls.markAllAsTouched();
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
        is_blind: formValues.is_blind,
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

      if (this.auction) {
        await this.auctionService.updateAuction(this.auction.id, auctionFields, currentUser.id);
        this.auctionUpdated.emit();
      } else {
        const payload: ICreateAuctionPayload = {
          guild_id: this.guildId,
          ...auctionFields,
        };
        await this.auctionService.createAuction(payload, currentUser.id);
        this.auctionCreated.emit();
      }
    } catch (err) {
      console.error('Failed to create auction:', err);
      this.errorMessage.set(err instanceof Error ? err.message : 'Failed to save auction. Please try again.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  cancel() {
    this.closeModal.emit();
  }
}
